import os
import re
import json
import fitz  # PyMuPDF

def extract_candidates(text, page_num):
    """
    Extracts candidate question numbers from a page's text.
    Looks for standard question formats:
    - "Question 1" or "Q1" or "Mark Scheme - Question 1" anywhere on a line
    - "1." or "1 (a)" or "1 - " or "1" at the start of a line
    """
    candidates = []
    lines = text.split("\n")
    cleaned_lines = [l.strip() for l in lines if l.strip()]
    if not cleaned_lines:
        return []
        
    # Detect standalone page numbers at the very top or bottom of the page
    ignore_vals = set()
    if cleaned_lines[0].isdigit():
        val = int(cleaned_lines[0])
        if abs(val - page_num) <= 2:
            ignore_vals.add(val)
    if cleaned_lines[-1].isdigit():
        val = int(cleaned_lines[-1])
        if abs(val - page_num) <= 2:
            ignore_vals.add(val)
            
    for idx, line in enumerate(lines):
        line_str = line.strip()
        if not line_str:
            continue
        
        # Pattern 1: Explicit "Question X" or "Q X" anywhere in the line
        m1 = re.search(r'\b(?:Question|Q|q)\.?\s*(\d+)\b', line_str)
        if m1:
            candidates.append(int(m1.group(1)))
            continue
            
        # Helper check to add candidates, filtering out header/footer page numbers
        # (Only ignore if the candidate matches the page number and is on the first/last non-empty line)
        def add_candidate(val, line_index):
            # Check if this line is the first or last non-empty line
            is_fl = False
            if cleaned_lines and (line_str == cleaned_lines[0] or line_str == cleaned_lines[-1]):
                is_fl = True
            if is_fl and val in ignore_vals:
                return
            candidates.append(val)

        # Pattern 2: Line starts with a question number followed by specific indicators
        # 1. "1. " or "1."
        if re.match(r'^(\d{1,3})\.(?:\s+|$)', line_str):
            val = int(re.match(r'^(\d{1,3})', line_str).group(1))
            add_candidate(val, idx)
            continue
        # 2. "1(a)" or "1 (a)"
        if re.match(r'^(\d{1,3})\s*\([a-z]\)', line_str):
            val = int(re.match(r'^(\d{1,3})', line_str).group(1))
            add_candidate(val, idx)
            continue
        # 3. "1 - "
        if re.match(r'^(\d{1,3})\s*-\s*', line_str):
            val = int(re.match(r'^(\d{1,3})', line_str).group(1))
            add_candidate(val, idx)
            continue
        # 4. "1 " followed by a capital letter (e.g. "1 Solve this")
        if re.match(r'^(\d{1,3})\s+[A-Z]', line_str):
            val = int(re.match(r'^(\d{1,3})', line_str).group(1))
            add_candidate(val, idx)
            continue
        # 5. Standalone number on a line "1"
        if re.match(r'^(\d{1,3})\s*$', line_str):
            val = int(re.match(r'^(\d{1,3})', line_str).group(1))
            add_candidate(val, idx)
            continue
            
    return list(dict.fromkeys(candidates))  # Remove duplicates while keeping order

def solve_sequence(pages_candidates):
    """
    Takes a list of candidate lists for each page, e.g.:
    [ [], [1, 15], [2], [3, 4], [5] ]
    And returns a clean mapping of page to active questions.
    Uses sequential heuristic: questions start at 1 and go up by 1.
    """
    num_pages = len(pages_candidates)
    
    # 1. Flatten into a list of (page_index, question_number)
    all_candidates = []
    for p_idx, cands in enumerate(pages_candidates):
        for c in cands:
            # Simple heuristic: question numbers should be reasonable (e.g. 1 to 50)
            if 1 <= c <= 50:
                all_candidates.append((p_idx, c))
                
    # 2. Find a sequence that is strictly non-decreasing and mostly incremental.
    # Since papers are sequential, we search for the sequence of question starts.
    # A question 'q' starts at page 'p'. We expect to see:
    # q=1, then q=2, then q=3...
    # Let's find the best sequence of question starts.
    # We construct a sequence of starts: (q, page)
    # Let's keep it simple: we iterate through target questions 1, 2, 3...
    # and find the page where they most likely start.
    question_starts = {}
    current_q = 1
    
    # We search forward page by page
    for p_idx in range(num_pages):
        cands = pages_candidates[p_idx]
        
        # If the question we are currently on is still seen in candidates,
        # we assume it is still active on this page and we do not transition to next.
        if current_q > 1 and (current_q - 1) in cands:
            continue
            
        # If the expected next question is in the candidates, mark its start here!
        if current_q in cands:
            question_starts[current_q] = p_idx
            current_q += 1
            # Check if we also have the next one on the same page
            while current_q in cands:
                if current_q > 1 and (current_q - 1) in cands:
                    break
                question_starts[current_q] = p_idx
                current_q += 1
        elif (current_q + 1) in cands and current_q > 1:
            # Check if the missing question current_q appears later in the document.
            # If it does, we do NOT skip it now. We assume current_q + 1 is a false positive.
            q_found_later = False
            for lookahead_idx in range(p_idx + 1, num_pages):
                if current_q in pages_candidates[lookahead_idx]:
                    q_found_later = True
                    break
            if q_found_later:
                continue
                
            # If not found later, then we really missed it, so map it.
            question_starts[current_q] = max(0, p_idx - 1)
            question_starts[current_q + 1] = p_idx
            current_q += 2
            
    # Fallback: if we found no starts at all, let's scan for any numbers
    if not question_starts:
        # Just use whatever numbers we found in order
        last_q = 0
        for p_idx, cands in enumerate(pages_candidates):
            for c in cands:
                if c == last_q + 1:
                    question_starts[c] = p_idx
                    last_q = c
                    
    return question_starts

def generate_page_ranges(question_starts, num_pages):
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
                mapping[str(q)] = list(range(start_page + 1, end_page + 1))
        else:
            mapping[str(q)] = list(range(start_page + 1, num_pages + 1))
            
    return mapping

def map_paper_and_ms(subject, paper_name, paper_path, ms_path, cache_dir):
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
        text = page.get_text()
        # Ignore page 1 of the paper (cover/title page) to prevent false matches
        if p_idx == 0:
            cands = []
        else:
            cands = extract_candidates(text, p_idx + 1)
        paper_candidates.append(cands)
        
        # Render page as image
        pix = page.get_pixmap(dpi=150)
        img_path = os.path.join(paper_cache_dir, f"page_{p_idx + 1}.png")
        pix.save(img_path)
        
    paper_starts = solve_sequence(paper_candidates)
    paper_ranges = generate_page_ranges(paper_starts, paper_num_pages)
    
    # 2. Parse Mark Scheme
    ms_doc = fitz.open(ms_path)
    ms_num_pages = len(ms_doc)
    ms_candidates = []
    
    ms_started = False
    for p_idx in range(ms_num_pages):
        page = ms_doc[p_idx]
        text = page.get_text()
        
        # Activate marking candidates only once we hit the marking grid
        t_lower = text.lower()
        if not ms_started:
            if "guidance" in t_lower or "acceptable" in t_lower:
                ms_started = True
                
        if ms_started:
            cands = extract_candidates(text, p_idx + 1)
        else:
            cands = []
        ms_candidates.append(cands)
        
        # Render page as image
        pix = page.get_pixmap(dpi=150)
        img_path = os.path.join(ms_cache_dir, f"page_{p_idx + 1}.png")
        pix.save(img_path)
        
    ms_starts = solve_sequence(ms_candidates)
    ms_ranges = generate_page_ranges(ms_starts, ms_num_pages)
    
    # 3. Align Paper Questions and MS Questions
    # We combine them into a single structure
    questions_map = {}
    all_qs = set(paper_ranges.keys()) | set(ms_ranges.keys())
    
    # Sort them numerically
    sorted_qs = sorted(list(all_qs), key=lambda x: int(x) if x.isdigit() else 999)
    
    for q in sorted_qs:
        questions_map[q] = {
            "paper_pages": paper_ranges.get(q, []),
            "ms_pages": ms_ranges.get(q, [])
        }
        
    # Metadata summary
    metadata = {
        "subject": subject,
        "paper_name": paper_name,
        "paper_total_pages": paper_num_pages,
        "ms_total_pages": ms_num_pages,
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
