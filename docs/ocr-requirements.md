# OCR Service Requirements for Audiobookshelf

## Use Cases

1. **Scanned PDF ebooks** — user uploads a PDF that's just page images (no selectable text). ABS needs searchable text for: ebook reader, smart search, AI companion, language learning alignment.

2. **Book cover text extraction** — extract title/author from cover images when metadata is missing.

3. **Page-by-page ebook creation** — convert a folder of scanned page images into a searchable EPUB/PDF.

4. **Handwritten notes/annotations** — future: recognize handwritten margin notes in scanned books.

## Architecture

OCR should be a **separate service** that ABS calls via HTTP API:

```
ABS ──POST /ocr──→ OCR Service ──→ returns text + coordinates
```

ABS sends an image or PDF, gets back structured text. The OCR service handles all the heavy lifting (models, GPU, language detection).

## API Requirements

### R1: Single image OCR
```
POST /api/v1/ocr
Content-Type: multipart/form-data

file: <image.png|jpg|tiff|webp>
language: "eng"          (optional, ISO 639-3 or auto-detect)
output: "text"           (text | hocr | json)

Response:
{
  "text": "Chapter 1\nIt was a dark and stormy night...",
  "confidence": 92.5,
  "language": "eng",
  "blocks": [
    { "text": "Chapter 1", "bbox": [100, 50, 400, 90], "confidence": 98.2 },
    { "text": "It was a dark...", "bbox": [100, 120, 800, 160], "confidence": 91.0 }
  ]
}
```

### R2: PDF OCR (multi-page)
```
POST /api/v1/ocr/pdf
Content-Type: multipart/form-data

file: <scanned.pdf>
language: "eng"
output: "searchable_pdf"   (searchable_pdf | text | json)
pages: "1-10"              (optional, page range)

Response (if output=json):
{
  "pages": [
    { "page": 1, "text": "...", "confidence": 91.2 },
    { "page": 2, "text": "...", "confidence": 93.1 }
  ],
  "total_pages": 250,
  "processed_pages": 10
}

Response (if output=searchable_pdf):
Binary PDF with invisible text layer
```

### R3: Batch / async processing
For full books (200+ pages), OCR should be async:
```
POST /api/v1/ocr/jobs
{ "file_url": "http://abs:80/api/items/.../file/.../download", "language": "eng", "output": "searchable_pdf" }

Response:
{ "job_id": "abc123", "status": "queued", "pages": 250 }

GET /api/v1/ocr/jobs/abc123
{ "job_id": "abc123", "status": "processing", "progress": 45, "pages_done": 112 }

GET /api/v1/ocr/jobs/abc123/result
Binary: searchable PDF
```

### R4: Language support
Must support at minimum:
- Latin scripts: English, French, German, Spanish, Italian, Portuguese, Dutch
- Cyrillic: Russian
- CJK: Chinese, Japanese, Korean (nice to have)
- Arabic, Hebrew (nice to have)
- Auto-detection when language not specified

### R5: Health/status
```
GET /api/v1/status
{
  "available": true,
  "engine": "tesseract|surya|easyocr|doctr|paddleocr",
  "languages": ["eng", "fra", "deu", ...],
  "gpu": true,
  "version": "1.0"
}
```

### R6: Docker deployment
Must run as a Docker container on the same network as ABS:
```yaml
services:
  ocr:
    image: <tbd>
    networks:
      - web
    environment:
      - LANGUAGES=eng,fra,deu,spa
    # Optional GPU passthrough:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - capabilities: [gpu]
```

## Candidate Services to Evaluate

### Option A: Stirling-PDF
- Already has OCR, PDF manipulation, Docker image
- Uses Tesseract + OCRmyPDF under the hood
- Has a REST API
- Heavy image (~1.5GB) but feature-rich
- URL: https://github.com/Stirling-Tools/Stirling-PDF

### Option B: OCRmyPDF as a service
- Wrap OCRmyPDF (Tesseract-based) in a thin FastAPI
- Lightweight, proven, great PDF output
- Supports 100+ languages via Tesseract
- URL: https://github.com/ocrmypdf/OCRmyPDF

### Option C: Surya OCR
- Modern ML-based OCR (better than Tesseract for many scripts)
- Line detection + text recognition
- 90+ languages, good CJK support
- GPU accelerated
- URL: https://github.com/VikParuchuri/surya

### Option D: docTR
- Deep learning OCR by Mindee
- Detection + recognition pipeline
- Good accuracy, GPU support
- URL: https://github.com/mindee/doctr

### Option E: PaddleOCR
- By Baidu, excellent for multilingual
- Best CJK support
- Lightweight models
- URL: https://github.com/PaddlePaddle/PaddleOCR

### Option F: EasyOCR
- Simple Python API, 80+ languages
- Good balance of accuracy and speed
- URL: https://github.com/JaidedAI/EasyOCR

## Recommendation

**For your setup**: Stirling-PDF (Option A) — you may already want it for other PDF tasks, and it has a full REST API with OCR built in.

**For accuracy**: Surya (Option C) — best modern OCR, especially for mixed-language books.

**For simplicity**: OCRmyPDF wrapped in FastAPI (Option B) — lightest, most proven for the "make scanned PDF searchable" use case.

Pick one, deploy it as a Docker container, and I'll wire ABS to call it.

## ABS Integration (my side)

Once you pick a service, I'll add:
- `OcrManager.js` — thin client that calls the OCR service API
- `POST /api/items/:id/ocr` — trigger OCR on a library item's PDF
- `GET /api/items/:id/ocr/status` — check progress
- Auto-detect scanned PDFs (no selectable text) and suggest OCR
- Store OCR text alongside the ebook for search/AI features
