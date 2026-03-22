import Vision
import Foundation

// Usage: vision-tagger <image_path> [image_path ...]
// Output: JSON array of objects, one per image
// Each object: {"labels": ["sky","outdoor",...], "text": ["MENU","HOTEL",...]}

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: vision-tagger <image_path> [image_path ...]\n", stderr)
    exit(1)
}

let paths = Array(CommandLine.arguments.dropFirst())
var allResults: [[String: [String]]] = []

for path in paths {
    let url = URL(fileURLWithPath: path)

    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        allResults.append(["labels": [], "text": []])
        continue
    }

    let classifyRequest = VNClassifyImageRequest()
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .accurate
    textRequest.recognitionLanguages = ["ja", "en"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([classifyRequest, textRequest])
    } catch {
        allResults.append(["labels": [], "text": []])
        continue
    }

    // Per-class adaptive threshold via PR curve + confidence floor to reject noise
    let labels = (classifyRequest.results ?? [])
        .filter { $0.hasMinimumRecall(0.3, forPrecision: 0.5) && $0.confidence >= 0.1 }
        .map { $0.identifier }

    // OCR text: deduplicate, filter short strings, limit count
    var seenText = Set<String>()
    var textResults: [String] = []
    for observation in (textRequest.results ?? []) {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        // Skip very short or numeric-only strings
        if text.count < 2 { continue }
        if text.allSatisfy({ $0.isNumber || $0.isPunctuation || $0.isWhitespace }) { continue }
        let normalized = text.lowercased()
        if !seenText.contains(normalized) {
            seenText.insert(normalized)
            textResults.append(text)
        }
        if textResults.count >= 20 { break }
    }

    allResults.append(["labels": labels, "text": textResults])
}

let json = try! JSONSerialization.data(withJSONObject: allResults, options: [])
print(String(data: json, encoding: .utf8)!)
