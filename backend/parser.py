import os
import re
import json
import fitz  # PyMuPDF
import urllib.request
from bs4 import BeautifulSoup

def extract_candidates(page, page_num):
    """
    Extracts candidate question numbers from a page.
    Filters out table columns (marks, guidance) and page numbers by checking horizontal coordinates and margins.
    Groups words by (block_no, line_no) and checks left margin of the first word on each line.
    """
    candidates = []
    words = page.get_text("words")
    page_height = page.rect.height
    
    # Sort words top-to-bottom, then left-to-right
    words.sort(key=lambda w: (w[1], w[0]))
    
    # Group words into lines
    lines_dict = {}
    for w in words:
        x0, y0, x1, y1, text, block_no, line_no, word_no = w
        key = (block_no, line_no)
        if key not in lines_dict:
            lines_dict[key] = []
        lines_dict[key].append(w)
        
    for key, line_words in lines_dict.items():
        # Sort words left-to-right on the line
        line_words.sort(key=lambda w: w[0])
        
        first_word = line_words[0]
        x0, y0, x1, y1, text, block_no, line_no, word_no = first_word
        
        # Ignore top and bottom margins completely (headers/footers/page codes)
        if y1 < 55 or y0 > page_height - 65:
            continue
            
        # Left margin check - the line must start on the left margin
        if x0 > 95:
            continue
            
        # Construct line text
        line_str = " ".join([w[4] for w in line_words]).strip()
        if not line_str:
            continue
            
        # Filter out decimals
        if re.match(r'^\d+\.\d+', line_str):
            continue
            
        # Filter out mark explanations like "1 mark" or "(2 marks)" unless they contain "scheme"
        if re.search(r'\bmarks?\b', line_str, re.IGNORECASE) and not re.search(r'\bscheme\b', line_str, re.IGNORECASE):
            continue
            
        # Pattern 1: Explicit "Question X" or "Q X"
        m1 = re.search(r'\bQuestion\b\.?\s*(\d+)\b', line_str, re.IGNORECASE)
        if m1:
            candidates.append(int(m1.group(1)))
            continue
            
        m1_q = re.search(r'\bQ\b\.?\s*(\d+)\b', line_str, re.IGNORECASE)
        if m1_q:
            candidates.append(int(m1_q.group(1)))
            continue
            
        # Pattern 2: Line starts with a question number
        m2 = re.match(r'^(\d{1,3})\b', line_str)
        if m2:
            candidates.append(int(m2.group(1)))
            continue
            
    return [c for c in list(dict.fromkeys(candidates)) if 0 < c <= 50]

def solve_sequence(pages_candidates):
    """
    Takes a list of candidate lists for each page and returns a clean mapping of page to active questions.
    Uses sequential heuristic: questions start at 1 and go up by 1.
    If a gap of more than 2 consecutive questions is encountered, we assume the rest of the matches are false positives.
    """
    question_starts = {}
    num_pages = len(pages_candidates)
    last_page = 0
    consecutive_missing = 0
    
    for q in range(1, 51):
        found = False
        for p_idx in range(last_page, num_pages):
            if q in pages_candidates[p_idx]:
                question_starts[q] = p_idx
                last_page = p_idx
                found = True
                break
        if found:
            consecutive_missing = 0
        else:
            consecutive_missing += 1
            if consecutive_missing > 2:
                # Stop matching subsequent questions after a gap of more than 2 questions
                break
                
    # Fallback: if we found no starts at all, let's scan for any numbers
    if not question_starts:
        last_q = 0
        for p_idx, cands in enumerate(pages_candidates):
            for c in cands:
                if c == last_q + 1:
                    question_starts[c] = p_idx
                    last_q = c
                    
    return question_starts

def generate_page_ranges(question_starts, num_pages, pages_candidates):
    """
    Converts question start pages into ranges of pages for each question.
    E.g. {1: 1, 2: 3, 3: 4} with 5 pages
    Returns:
    {
      "1": [1, 2],
      "2": [3],
      "3": [4, 5]
    }
    Note: page indices are 0-based here.
    If the next question starts on a page, but the current question is still a candidate on that page,
    we allow the page ranges to overlap by including that page in the current question's range.
    """
    sorted_qs = sorted(question_starts.keys())
    if not sorted_qs:
        return {}
        
    mapping = {}
    for i in range(len(sorted_qs)):
        q = sorted_qs[i]
        start_page = question_starts[q]
        
        # End page is either the start of the next question, or the end of the document
        if i + 1 < len(sorted_qs):
            next_q = sorted_qs[i+1]
            end_page = question_starts[next_q]
            # If next question starts on the same page, this question also ends on that page
            if end_page == start_page:
                mapping[str(q)] = [start_page + 1]
            else:
                # Check if current question q is a candidate on the end_page (where next_q starts)
                # and end_page is within document bounds
                if end_page < len(pages_candidates) and q in pages_candidates[end_page]:
                    mapping[str(q)] = list(range(start_page + 1, end_page + 2))
                else:
                    mapping[str(q)] = list(range(start_page + 1, end_page + 1))
        else:
            mapping[str(q)] = list(range(start_page + 1, num_pages + 1))
            
    return mapping

def map_paper_and_ms(subject, paper_name, paper_path, ms_path, cache_dir, board=None, level=None):
    """
    Main function to parse both PDFs, find questions, map them, render pages, and save metadata.
    """
    # Create unique cache directories for rendering
    paper_cache_dir = os.path.join(cache_dir, subject, paper_name, "paper")
    ms_cache_dir = os.path.join(cache_dir, subject, paper_name, "mark_scheme")
    os.makedirs(paper_cache_dir, exist_ok=True)
    os.makedirs(ms_cache_dir, exist_ok=True)
    
    # 1. Parse Paper
    paper_doc = fitz.open(paper_path)
    paper_num_pages = len(paper_doc)
    paper_candidates = []
    
    for p_idx in range(paper_num_pages):
        page = paper_doc[p_idx]
        # Ignore page 1 of the paper (cover/title page) to prevent false matches
        if p_idx == 0:
            cands = []
        else:
            cands = extract_candidates(page, p_idx + 1)
        paper_candidates.append(cands)
        
        # Render page as image
        pix = page.get_pixmap(dpi=150)
        img_path = os.path.join(paper_cache_dir, f"page_{p_idx + 1}.png")
        pix.save(img_path)
        
    paper_starts = solve_sequence(paper_candidates)
    paper_ranges = generate_page_ranges(paper_starts, paper_num_pages, paper_candidates)
    
    # 2. Parse Mark Scheme
    ms_doc = fitz.open(ms_path)
    ms_num_pages = len(ms_doc)
    ms_candidates = []
    
    for p_idx in range(ms_num_pages):
        page = ms_doc[p_idx]
        # Ignore page 1 of the mark scheme (cover/title page) to prevent false matches
        if p_idx == 0:
            cands = []
        else:
            cands = extract_candidates(page, p_idx + 1)
        ms_candidates.append(cands)
        
        # Render page as image
        pix = page.get_pixmap(dpi=150)
        img_path = os.path.join(ms_cache_dir, f"page_{p_idx + 1}.png")
        pix.save(img_path)
        
    ms_starts = solve_sequence(ms_candidates)
    ms_ranges = generate_page_ranges(ms_starts, ms_num_pages, ms_candidates)
    
    # 3. Align Paper Questions and MS Questions
    # We prioritize paper questions as the source of truth to avoid false positives at the end of mark schemes.
    # We fallback to MS questions if no questions were detected in the paper.
    questions_map = {}
    if paper_ranges:
        all_qs = set(paper_ranges.keys())
    else:
        all_qs = set(ms_ranges.keys())
        
    # Sort them numerically
    sorted_qs = sorted(list(all_qs), key=lambda x: int(x) if x.isdigit() else 999)
    
    # Get or crawl revision notes index if board & level are provided
    notes = []
    if board and level:
        notes = get_or_crawl_notes_index(subject, board, level, cache_dir)
    
    for q in sorted_qs:
        # Extract text for this question to auto-match notes
        q_text = ""
        q_pages = paper_ranges.get(q, [])
        for p in q_pages:
            if 0 < p <= len(paper_doc):
                q_text += paper_doc[p-1].get_text()
                
        best_note, score = find_best_revision_note_match(q_text, notes)
        
        questions_map[q] = {
            "paper_pages": q_pages,
            "ms_pages": ms_ranges.get(q, []),
            "note_title": best_note["title"] if best_note else None,
            "note_url": best_note["url"] if best_note else None
        }
        
    # Metadata summary
    metadata = {
        "subject": subject,
        "paper_name": paper_name,
        "paper_total_pages": paper_num_pages,
        "ms_total_pages": ms_num_pages,
        "board": board,
        "level": level,
        "questions": questions_map
    }
    
    # Save mapping metadata
    meta_path = os.path.join(cache_dir, subject, paper_name, "mapping.json")
    os.makedirs(os.path.dirname(meta_path), exist_ok=True)
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
        
    paper_doc.close()
    ms_doc.close()
    
    return metadata

def get_or_crawl_notes_index(subject, board, level, cache_dir):
    subj_folder = os.path.join(cache_dir, subject)
    os.makedirs(subj_folder, exist_ok=True)
    cache_file = os.path.join(subj_folder, f"{board.lower()}_notes_index.json")
    
    # Load from cache if exists
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
            
    # Crawl if not cached
    notes = crawl_savemyexams_notes_index(subject, board, level)
    if notes:
        try:
            with open(cache_file, "w") as f:
                json.dump(notes, f, indent=2)
        except Exception:
            pass
    return notes

def crawl_savemyexams_notes_index(subject, board, level):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    subj_slug = subject.lower().replace(" ", "-")
    board_slug = board.lower().replace(" ", "-")
    level_slug = level.lower().replace(" ", "-")
    
    start_url = f"https://www.savemyexams.com/{level_slug}/{subj_slug}/{board_slug}/"
    try:
        req = urllib.request.Request(start_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error crawling start page {start_url}: {e}")
        return []
        
    soup = BeautifulSoup(html, 'html.parser')
    index_links = []
    seen_indices = set()
    
    prefix = f"/{level_slug}/{subj_slug}/{board_slug}/"
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith(prefix):
            normalized_href = href.rstrip('/')
            if normalized_href.endswith('/revision-notes') or '/revision-notes/' in href:
                m = re.search(r'(.*/revision-notes/)', href)
                if m:
                    idx_url = m.group(1)
                    if idx_url not in seen_indices:
                        seen_indices.add(idx_url)
                        index_links.append(idx_url)
                        
    all_subtopics = []
    seen_subtopics = set()
    
    for idx_link in index_links:
        full_idx_url = f"https://www.savemyexams.com{idx_link}"
        try:
            req = urllib.request.Request(full_idx_url, headers=headers)
            with urllib.request.urlopen(req) as response:
                idx_html = response.read().decode('utf-8')
        except Exception:
            continue
            
        idx_soup = BeautifulSoup(idx_html, 'html.parser')
        
        for a in idx_soup.find_all('a', href=True):
            href = a['href']
            if href.startswith(idx_link) and href != idx_link:
                full_sub_url = f"https://www.savemyexams.com{href}"
                if full_sub_url not in seen_subtopics:
                    seen_subtopics.add(full_sub_url)
                    title = a.get_text().strip()
                    if title and not title.isdigit():
                        all_subtopics.append({
                            "title": title,
                            "url": full_sub_url
                        })
                        
    return all_subtopics

def find_best_revision_note_match(question_text, subtopics):
    if not subtopics or not question_text:
        return None, 0
        
    q_words = set(re.findall(r'\b[a-z]{3,}\b', question_text.lower()))
    best_match = None
    best_score = 0
    
    stop_words = {'and', 'the', 'for', 'with', 'from', 'each', 'than', 'this', 'that', 'these', 'those'}
    
    for s in subtopics:
        t_words = [w for w in re.findall(r'\b[a-z]{3,}\b', s["title"].lower()) if w not in stop_words]
        if not t_words:
            continue
            
        matches = [w for w in t_words if w in q_words]
        score = len(matches) / len(t_words)
        
        if score > best_score:
            best_score = score
            best_match = s
            
    if best_score > 0.1:
        return best_match, best_score
    return None, 0

if __name__ == "__main__":
    # Test script locally
    test_paper = os.path.join("subjects", "Maths", "papers", "2023_paper1.pdf")
    test_ms = os.path.join("subjects", "Maths", "mark_schemes", "2023_paper1_ms.pdf")
    test_cache = "cache"
    
    if os.path.exists(test_paper) and os.path.exists(test_ms):
        print("Running test parser...")
        meta = map_paper_and_ms("Maths", "2023_paper1", test_paper, test_ms, test_cache)
        print("Generated Mapping:")
        print(json.dumps(meta, indent=2))
    else:
        print("Test PDFs not found. Run create_mock_pdfs.py first.")
