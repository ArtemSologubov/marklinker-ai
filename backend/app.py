import os
import sys
import json
import re
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from parser import map_paper_and_ms

# ── PyInstaller / development path resolution ─────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    BASE_DIR  = os.path.dirname(sys.executable)   # folder containing MarkLinkerAI.exe
    _FRONTEND = os.path.join(sys._MEIPASS, 'frontend')  # bundled static files
else:
    # Normal development run
    BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _FRONTEND = os.path.join(BASE_DIR, 'frontend')
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder=_FRONTEND, static_url_path="")
CORS(app)

SUBJECTS_DIR = os.path.join(BASE_DIR, "subjects")
CACHE_DIR = os.path.join(BASE_DIR, "cache")

os.makedirs(SUBJECTS_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# Helper: normalize string for filename matching
def normalize(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())

def clean_url(url):
    import urllib.parse
    if not url:
        return url
    try:
        # Unquote first to prevent double-encoding %20 -> %2520
        unquoted = urllib.parse.unquote(url)
        parsed = urllib.parse.urlparse(unquoted)
        quoted_path = urllib.parse.quote(parsed.path, safe='/')
        return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, quoted_path, parsed.params, parsed.query, parsed.fragment))
    except Exception:
        return url

def get_subject_folders(subject):
    """
    Finds the active papers and mark schemes directories for a subject.
    Returns (papers_dir, ms_dir)
    """
    subj_dir = os.path.join(SUBJECTS_DIR, subject)
    if not os.path.exists(subj_dir):
        return os.path.join(subj_dir, "papers"), os.path.join(subj_dir, "mark_schemes")
        
    subdirs = [d for d in os.listdir(subj_dir) if os.path.isdir(os.path.join(subj_dir, d))]
    
    # Try to find a folder matching papers (e.g., papers, pastpapers, past_papers, past papers, etc.)
    papers_dir = None
    for d in subdirs:
        if "paper" in d.lower():
            papers_dir = os.path.join(subj_dir, d)
            break
            
    # Try to find a folder matching mark schemes (e.g., markschemes, mark_schemes, ms, mark schemes)
    ms_dir = None
    for d in subdirs:
        d_lower = d.lower()
        if "mark" in d_lower or "scheme" in d_lower or "ms" in d_lower:
            ms_dir = os.path.join(subj_dir, d)
            break
            
    # Fallback/Default if not found
    if not papers_dir:
        papers_dir = os.path.join(subj_dir, "papers")
    if not ms_dir:
        ms_dir = os.path.join(subj_dir, "mark_schemes")
        
    return papers_dir, ms_dir

def find_matching_mark_scheme(subject, paper_file):
    """
    Tries to find the best matching mark scheme PDF.
    """
    _, ms_dir = get_subject_folders(subject)
    if not os.path.exists(ms_dir):
        return None
        
    ms_files = [f for f in os.listdir(ms_dir) if f.endswith(".pdf")]
    if not ms_files:
        return None
        
    paper_base, _ = os.path.splitext(paper_file)
    norm_paper = normalize(paper_base)
    
    # Try direct contains match
    for ms in ms_files:
        ms_base, _ = os.path.splitext(ms)
        norm_ms = normalize(ms_base)
        if norm_paper in norm_ms or norm_ms in norm_paper:
            return ms
            
    # Fallback to the first available mark scheme if nothing matches
    return ms_files[0]

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/subjects", methods=["GET"])
def get_subjects():
    if not os.path.exists(SUBJECTS_DIR):
        return jsonify([])
    subjects = [d for d in os.listdir(SUBJECTS_DIR) if os.path.isdir(os.path.join(SUBJECTS_DIR, d))]
    return jsonify(subjects)

@app.route("/api/create_subject", methods=["POST"])
def create_subject():
    data = request.json
    subject = data.get("subject")
    if not subject:
        return jsonify({"error": "Subject name is required"}), 400
        
    subj_dir = os.path.join(SUBJECTS_DIR, subject)
    os.makedirs(os.path.join(subj_dir, "papers"), exist_ok=True)
    os.makedirs(os.path.join(subj_dir, "mark_schemes"), exist_ok=True)
    return jsonify({"success": True, "message": f"Subject '{subject}' created successfully"})

@app.route("/api/upload", methods=["POST"])
def upload_file():
    subject = request.form.get("subject")
    file_type = request.form.get("type")  # "paper" or "mark_scheme"
    
    if not subject or not file_type:
        return jsonify({"error": "Subject and file type (paper/mark_scheme) are required"}), 400
        
    if 'file' not in request.files:
        return jsonify({"error": "No file part in request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are allowed"}), 400
        
    papers_dir, ms_dir = get_subject_folders(subject)
    target_dir = papers_dir if file_type == "paper" else ms_dir
    subfolder = os.path.basename(target_dir)
    os.makedirs(target_dir, exist_ok=True)
    
    target_path = os.path.join(target_dir, file.filename)
    file.save(target_path)
    
    return jsonify({"success": True, "filename": file.filename, "message": f"File uploaded successfully to {subfolder}"})

@app.route("/api/papers", methods=["GET"])
def get_papers():
    subject = request.args.get("subject")
    if not subject:
        return jsonify({"error": "Subject is required"}), 400
        
    papers_dir, _ = get_subject_folders(subject)
    if not os.path.exists(papers_dir):
        return jsonify([])
        
    paper_files = [f for f in os.listdir(papers_dir) if f.endswith(".pdf")]
    papers_list = []
    
    for pf in paper_files:
        paper_name, _ = os.path.splitext(pf)
        mapping_path = os.path.join(CACHE_DIR, subject, paper_name, "mapping.json")
        is_processed = os.path.exists(mapping_path)
        
        # Check if we can find a matching mark scheme
        matched_ms = find_matching_mark_scheme(subject, pf)
        
        papers_list.append({
            "filename": pf,
            "name": paper_name,
            "processed": is_processed,
            "matched_mark_scheme": matched_ms
        })
        
    return jsonify(papers_list)

@app.route("/api/mark_schemes", methods=["GET"])
def get_mark_schemes():
    subject = request.args.get("subject")
    if not subject:
        return jsonify({"error": "Subject is required"}), 400
        
    _, ms_dir = get_subject_folders(subject)
    if not os.path.exists(ms_dir):
        return jsonify([])
        
    ms_files = [f for f in os.listdir(ms_dir) if f.endswith(".pdf")]
    return jsonify(ms_files)

@app.route("/api/process", methods=["POST"])
def process_paper():
    data = request.json
    subject = data.get("subject")
    paper_file = data.get("paper_file")
    ms_file = data.get("ms_file")
    board = data.get("board")
    level = data.get("level")
    
    if not subject or not paper_file:
        return jsonify({"error": "Subject and paper_file are required"}), 400
        
    papers_dir, ms_dir = get_subject_folders(subject)
    paper_path = os.path.join(papers_dir, paper_file)
    if not os.path.exists(paper_path):
        return jsonify({"error": "Paper PDF not found"}), 404
        
    # Auto-detect mark scheme if not provided
    if not ms_file:
        ms_file = find_matching_mark_scheme(subject, paper_file)
        
    if not ms_file:
        return jsonify({"error": "No matching mark scheme found. Please upload one."}), 400
        
    ms_path = os.path.join(ms_dir, ms_file)
    if not os.path.exists(ms_path):
        return jsonify({"error": f"Mark scheme PDF '{ms_file}' not found"}), 404
        
    paper_name, _ = os.path.splitext(paper_file)
    
    try:
        # Run local parser to map questions and render pages
        metadata = map_paper_and_ms(subject, paper_name, paper_path, ms_path, CACHE_DIR, board, level)
        return jsonify({"success": True, "metadata": metadata})
    except Exception as e:
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route("/api/mapping", methods=["GET"])
def get_mapping():
    subject = request.args.get("subject")
    paper_name = request.args.get("paper_name")
    
    if not subject or not paper_name:
        return jsonify({"error": "subject and paper_name are required"}), 400
        
    mapping_path = os.path.join(CACHE_DIR, subject, paper_name, "mapping.json")
    if not os.path.exists(mapping_path):
        return jsonify({"error": "Paper has not been processed yet"}), 404
        
    with open(mapping_path, "r") as f:
        data = json.load(f)
    return jsonify(data)

@app.route("/api/update_mapping", methods=["POST"])
def update_mapping():
    data = request.json
    subject = data.get("subject")
    paper_name = data.get("paper_name")
    questions = data.get("questions")
    
    if not subject or not paper_name or questions is None:
        return jsonify({"error": "subject, paper_name, and questions list are required"}), 400
        
    mapping_path = os.path.join(CACHE_DIR, subject, paper_name, "mapping.json")
    if not os.path.exists(mapping_path):
        return jsonify({"error": "Paper mapping does not exist"}), 404
        
    with open(mapping_path, "r") as f:
        meta = json.load(f)
        
    # Update questions mapping
    meta["questions"] = questions
    
    with open(mapping_path, "w") as f:
        json.dump(meta, f, indent=2)
        
    return jsonify({"success": True, "message": "Mapping updated successfully"})
 
@app.route("/api/unprocess", methods=["POST"])
def unprocess_paper():
    data = request.json
    subject = data.get("subject")
    paper_name = data.get("paper_name")
    
    if not subject or not paper_name:
        return jsonify({"error": "subject and paper_name are required"}), 400
        
    paper_cache_dir = os.path.join(CACHE_DIR, subject, paper_name)
    if os.path.exists(paper_cache_dir):
        import shutil
        import uuid
        import time
        
        # Try direct deletion with retry
        for attempt in range(3):
            try:
                shutil.rmtree(paper_cache_dir)
                return jsonify({"success": True, "message": "Paper cache reset successfully"})
            except Exception:
                time.sleep(0.1)
                
        # If direct deletion fails (locked files on Windows), use the rename trick
        try:
            temp_dir = os.path.join(CACHE_DIR, subject, f"{paper_name}_deleted_{uuid.uuid4().hex}")
            os.rename(paper_cache_dir, temp_dir)
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass # Silently ignore deletion failure for the renamed temp directory
            return jsonify({"success": True, "message": "Paper cache reset successfully"})
        except Exception as e:
            return jsonify({"error": f"Failed to reset paper: {str(e)}"}), 500
    else:
        return jsonify({"success": True, "message": "Paper is already unmapped"})

@app.route("/api/notes_index", methods=["GET"])
def get_notes_index_endpoint():
    subject = request.args.get("subject")
    board = request.args.get("board")
    level = request.args.get("level", "a-level")
    
    if not subject or not board:
        return jsonify({"error": "subject and board are required"}), 400
        
    from parser import get_or_crawl_notes_index
    try:
        notes = get_or_crawl_notes_index(subject, board, level, CACHE_DIR)
        return jsonify(notes)
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve notes index: {str(e)}"}), 500

@app.route("/api/note_content", methods=["GET"])
def get_note_content():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "url is required"}), 400
        
    if not url.startswith("https://www.savemyexams.com/"):
        return jsonify({"error": "Invalid URL"}), 400
        
    import hashlib
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    
    notes_cache_dir = os.path.join(CACHE_DIR, "notes")
    os.makedirs(notes_cache_dir, exist_ok=True)
    cache_path = os.path.join(notes_cache_dir, f"{url_hash}.html")
    
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return jsonify({"content": f.read()})
        except Exception:
            pass
            
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        import urllib.request
        from bs4 import BeautifulSoup
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            html = response.read()
            
        soup = BeautifulSoup(html, 'html.parser')
        
        content_div = soup.find(class_=re.compile(r'revision-note-content'))
        if not content_div:
            content_div = soup.find(class_=re.compile(r'pageContent'))
            
        if not content_div:
            return jsonify({"error": "Could not extract note content from page structure."}), 500
            
        for tag in content_div.find_all(style=True):
            del tag['style']
            
        clean_html = str(content_div)
        
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(clean_html)
            
        return jsonify({"content": clean_html})
    except Exception as e:
        return jsonify({"error": f"Failed to fetch note content: {str(e)}"}), 500

@app.route("/api/page/paper/<subject>/<paper_name>/<int:page_num>", methods=["GET"])
def serve_paper_page(subject, paper_name, page_num):
    page_path = os.path.join(CACHE_DIR, subject, paper_name, "paper", f"page_{page_num}.png")
    if not os.path.exists(page_path):
        return "Page image not found", 404
    return send_file(page_path, mimetype="image/png")

@app.route("/api/page/ms/<subject>/<paper_name>/<int:page_num>", methods=["GET"])
def serve_ms_page(subject, paper_name, page_num):
    page_path = os.path.join(CACHE_DIR, subject, paper_name, "mark_scheme", f"page_{page_num}.png")
    if not os.path.exists(page_path):
        return "Page image not found", 404
    return send_file(page_path, mimetype="image/png")

def scrape_pmt_papers(level, subject, board):
    import urllib.request
    import urllib.parse
    import urllib.error
    
    level = level.lower()
    subject = subject.lower()
    board = board.lower()
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
    subj_slug = subject
    if subject == 'combined-science':
        subj_slug = 'science'
        
    # 1. Determine index URL
    # Only A-level Maths and Further Maths use the special maths-revision path structure on PMT
    if level == 'a-level' and subject in ['maths', 'further-maths']:
        board_slug = board
        if board in ['ocr-a', 'ocr-b', 'ocr']:
            board_slug = 'ocr'
        suffix = "papers-further" if subject == 'further-maths' else "papers"
        index_url = f"https://www.physicsandmathstutor.com/maths-revision/{level}-{board_slug}/{suffix}/"
        subpages = [index_url]
    else:
        index_url = f"https://www.physicsandmathstutor.com/past-papers/{level}-{subj_slug}/"
        try:
            req = urllib.request.Request(index_url, headers=headers)
            html = urllib.request.urlopen(req).read().decode('utf-8')
        except Exception as e:
            raise Exception(f"Failed to fetch subject index page: {str(e)}")
            
        # Extract subpages matching board (handling absolute or relative links)
        # e.g., href="https://www.physicsandmathstutor.com/past-papers/a-level-physics/ocr-a-paper-1/"
        # or href="/past-papers/a-level-physics/ocr-a-paper-1/"
        pattern = rf'href=\x22(?:https://www\.physicsandmathstutor\.com)?(/past-papers/{level}-{subj_slug}/{board}-[^\x22]+)\x22'
        found_links = re.findall(pattern, html)
        subpages = list(set(found_links))
        
        # Prepend main site prefix to relative links
        subpages = [f"https://www.physicsandmathstutor.com{sp}" if sp.startswith('/') else sp for sp in subpages]
        
        # Fallback if board is ocr-a or ocr-b and no links found, try just 'ocr'
        if not subpages and board in ['ocr-a', 'ocr-b']:
            pattern_ocr = rf'href=\x22(?:https://www\.physicsandmathstutor\.com)?(/past-papers/{level}-{subj_slug}/ocr-[^\x22]+)\x22'
            found_links = re.findall(pattern_ocr, html)
            subpages = list(set([f"https://www.physicsandmathstutor.com{sp}" if sp.startswith('/') else sp for sp in found_links]))
            
    all_pdfs = []
    
    # 2. Fetch PDF links from each subpage
    for subpage in subpages:
        try:
            paper_label = ""
            subpage_clean = os.path.basename(subpage.rstrip('/'))
            
            # Extract standard labels by stripping board prefix
            # Sort prefixes by length descending to match longest first
            prefixes_to_strip = [board, 'ocr-a', 'ocr-b', 'ocr-mei', 'wjec-eduqas', 'wjec-wales', 'cie-igcse', 
                                 'edexcel-igcse-a', 'edexcel-igcse-b', 'edexcel-igcse', 'edexcel-ial',
                                 'ocr', 'aqa', 'edexcel', 'cie', 'wjec', 'eduqas']
            prefixes_to_strip.sort(key=len, reverse=True)
            
            stripped = False
            for prefix in prefixes_to_strip:
                if subpage_clean.startswith(prefix + '-'):
                    paper_label = subpage_clean[len(prefix)+1:].replace('-', ' ').title()
                    stripped = True
                    break
            
            if not stripped:
                paper_label = subpage_clean.replace('-', ' ').title()
            
            req = urllib.request.Request(subpage, headers=headers)
            html = urllib.request.urlopen(req).read().decode('utf-8')
            
            # Find all download links
            pdf_links = re.findall(r'href=\x22(https://pmt.physicsandmathstutor.com/download/[^\x22]+\.pdf)\x22', html)
            for link in pdf_links:
                all_pdfs.append({
                    "url": clean_url(link),
                    "subpage": subpage,
                    "paper_label": paper_label
                })
        except Exception as e:
            print(f"Skipping subpage {subpage} due to error: {e}")
            continue
            
    # 3. Group QPs and MSs
    grouped = {}
    
    for item in all_pdfs:
        url = item["url"]
        label = item["paper_label"]
        
        # Extract filename from URL
        filename = os.path.basename(urllib.parse.unquote(url))
        filename_no_ext, _ = os.path.splitext(filename)
        
        # Determine paper type case-insensitively
        url_upper = url.upper()
        file_upper = filename_no_ext.upper()
        is_qp = False
        is_ms = False
        if '/QP/' in url_upper or re.search(r'\bQP\b', file_upper) or '_QP' in file_upper:
            is_qp = True
        elif '/MS/' in url_upper or re.search(r'\bMS\b', file_upper) or '_MS' in file_upper or '/MA/' in url_upper or re.search(r'\bMA\b', file_upper) or '_MA' in file_upper:
            is_ms = True
        else:
            # Skip booklets/reports for grouping simplicity
            continue
            
        # Clean session/year name case-insensitively, e.g. "June 2023"
        session_name = re.sub(r'\s*(?:QP|MS|MA|ER|qp|ms|ma|er)\b.*$', '', filename_no_ext).strip()
        
        # If A-level Maths or Further Maths, extract module/paper number from path
        if level == 'a-level' and subject in ['maths', 'further-maths']:
            m = re.search(r'/(?:Papers|Past-Papers)/[^/]+/([^/]+)/', url, re.IGNORECASE)
            if m:
                label = m.group(1).replace('-', ' ').title()
            else:
                label = "Core"
                
        # Handle details in Maths names (e.g. Stats / Mech components)
        extra = ""
        if "Stats" in filename:
            extra = " (Stats)"
        elif "Mech" in filename:
            extra = " (Mech)"
            
        group_key = f"{label}_{session_name}{extra}".replace(' ', '_')
        display_name = f"{label} - {session_name}{extra}"
        
        if group_key not in grouped:
            grouped[group_key] = {
                "id": group_key,
                "display_name": display_name,
                "subject": subject.replace('-', ' ').title(),
                "qp_url": None,
                "ms_url": None,
                "qp_filename": None,
                "ms_filename": None
            }
            
        if is_qp:
            grouped[group_key]["qp_url"] = url
            grouped[group_key]["qp_filename"] = f"{display_name} QP.pdf"
        elif is_ms:
            grouped[group_key]["ms_url"] = url
            grouped[group_key]["ms_filename"] = f"{display_name} MS.pdf"
            
    # Keep only completed pairings that have both QP and MS
    final_list = [v for v in grouped.values() if v["qp_url"] and v["ms_url"]]
    
    # Sort them by paper label/year
    final_list.sort(key=lambda x: x["display_name"])
    return final_list

@app.route("/api/pmt/config", methods=["GET"])
def get_pmt_config():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "subject_boards.json")
    if not os.path.exists(config_path):
        return jsonify({"error": "Configuration file not found"}), 404
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": f"Failed to load configuration: {str(e)}"}), 500


@app.route("/api/pmt/list_papers", methods=["GET"])
def get_pmt_papers():
    level = request.args.get("level")
    subject = request.args.get("subject")
    board = request.args.get("board")
    
    if not level or not subject or not board:
        return jsonify({"error": "level, subject, and board are required"}), 400
        
    try:
        papers_list = scrape_pmt_papers(level, subject, board)
        return jsonify(papers_list)
    except Exception as e:
        return jsonify({"error": f"Scraping failed: {str(e)}"}), 500

@app.route("/api/pmt/download", methods=["POST"])
def download_pmt_papers():
    import urllib.request
    
    data = request.json
    subject = data.get("subject")
    papers_to_download = data.get("papers") # List of paper objects
    
    if not subject or not papers_to_download:
        return jsonify({"error": "Subject and papers list are required"}), 400
        
    papers_dir, ms_dir = get_subject_folders(subject)
    os.makedirs(papers_dir, exist_ok=True)
    os.makedirs(ms_dir, exist_ok=True)
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    downloaded_count = 0
    
    for paper in papers_to_download:
        qp_url = clean_url(paper.get("qp_url"))
        ms_url = clean_url(paper.get("ms_url"))
        qp_filename = paper.get("qp_filename")
        ms_filename = paper.get("ms_filename")
        
        try:
            # Download QP
            qp_req = urllib.request.Request(qp_url, headers=headers)
            with urllib.request.urlopen(qp_req) as response, open(os.path.join(papers_dir, qp_filename), 'wb') as out_file:
                out_file.write(response.read())
                
            # Download MS
            ms_req = urllib.request.Request(ms_url, headers=headers)
            with urllib.request.urlopen(ms_req) as response, open(os.path.join(ms_dir, ms_filename), 'wb') as out_file:
                out_file.write(response.read())
                
            downloaded_count += 1
        except Exception as e:
            print(f"Failed to download {paper.get('display_name')}: {e}")
            continue
            
    return jsonify({"success": True, "count": downloaded_count, "message": f"Successfully downloaded {downloaded_count} papers"})

if __name__ == "__main__":
    # Start local Flask server
    print("Starting local revision app on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
