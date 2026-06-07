import os
import fitz  # PyMuPDF

def create_mock_pdf(filename, title, pages_content):
    # Ensure directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    doc = fitz.open()
    
    # Title Page
    page = doc.new_page()
    page.insert_text((72, 72), title, fontsize=24, color=(0.1, 0.2, 0.6))
    page.insert_text((72, 120), "Generated locally for testing Revision App matching.", fontsize=12, color=(0.4, 0.4, 0.4))
    
    # Content Pages
    for idx, content in enumerate(pages_content):
        page = doc.new_page()
        # Header
        page.insert_text((72, 36), f"{title} - Page {idx + 2}", fontsize=9, color=(0.5, 0.5, 0.5))
        
        # Insert content text line by line
        y = 100
        for line in content.split("\n"):
            # If line starts with "Question" or "Mark Scheme", make it bigger/bold
            if line.strip().startswith("Question") or line.strip().startswith("Mark Scheme"):
                page.insert_text((72, y), line, fontsize=16, color=(0.1, 0.1, 0.1))
                y += 30
            else:
                page.insert_text((72, y), line, fontsize=12, color=(0.2, 0.2, 0.2))
                y += 20
                
        # Footer
        page.insert_text((72, 750), "Confidential - For Exam Revision Purposes Only", fontsize=8, color=(0.7, 0.7, 0.7))
        
    doc.save(filename)
    doc.close()
    print(f"Created {filename}")

if __name__ == "__main__":
    subjects_dir = os.path.join("subjects", "Maths")
    
    # 1. Create Mock Exam Paper
    paper_path = os.path.join(subjects_dir, "papers", "2023_paper1.pdf")
    paper_pages = [
        # Page 2
        "Question 1\nFind the value of x in the following linear equation:\n2x + 5 = 15\nShow your working clearly.\n[2 marks]",
        # Page 3
        "Question 2\nSolve the quadratic equation:\nx^2 - 5x + 6 = 0\nVerify your answers.\n[3 marks]",
        # Page 4
        "Question 3\nA right-angled triangle has shorter sides of length 3cm and 4cm.\nCalculate the length of the hypotenuse.\n[4 marks]",
        # Page 5 (contains two questions)
        "Question 4\nCalculate the area of a circle with a radius of 7cm.\nTake pi to be 22/7.\n[3 marks]\n\nQuestion 5\nFind the derivative of the function:\ny = 3x^2 + 2x - 5\n[2 marks]"
    ]
    create_mock_pdf(paper_path, "GCSE Mathematics 2023 Paper 1", paper_pages)
    
    # 2. Create Mock Mark Scheme
    ms_path = os.path.join(subjects_dir, "mark_schemes", "2023_paper1_ms.pdf")
    ms_pages = [
        # Page 2
        "Mark Scheme - Question 1\n2x = 15 - 5 => 2x = 10 (1 mark)\nx = 5 (1 mark)\n\nNotes: Accept alternative correct algebraic methods.",
        # Page 3
        "Mark Scheme - Question 2\nFactorization:\n(x - 2)(x - 3) = 0 (1 mark)\nSolutions:\nx = 2 (1 mark)\nx = 3 (1 mark)",
        # Page 4
        "Mark Scheme - Question 3\nApply Pythagoras Theorem:\na^2 + b^2 = c^2\n3^2 + 4^2 = 9 + 16 = 25 (2 marks)\nc = sqrt(25) = 5 cm (2 marks)",
        # Page 5 (contains two question answers)
        "Mark Scheme - Question 4\nArea = pi * r^2\nArea = (22/7) * 7^2 = 22 * 7 = 154 cm^2 (2 marks)\nCorrect units (1 mark)\n\nMark Scheme - Question 5\ndy/dx = d/dx(3x^2) + d/dx(2x) - d/dx(5)\ndy/dx = 6x + 2 (2 marks)\n1 mark for 6x, 1 mark for + 2"
    ]
    create_mock_pdf(ms_path, "GCSE Mathematics 2023 Mark Scheme", ms_pages)
