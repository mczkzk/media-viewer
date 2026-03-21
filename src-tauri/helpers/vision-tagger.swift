import Vision
import Foundation

// Usage: vision-tagger <image_path> [image_path ...]
// Output: JSON array of arrays, one per image
// Each inner array contains classification labels with confidence >= 0.4

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: vision-tagger <image_path> [image_path ...]\n", stderr)
    exit(1)
}

let paths = Array(CommandLine.arguments.dropFirst())
var allResults: [[String]] = []

for path in paths {
    let url = URL(fileURLWithPath: path)

    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        allResults.append([])
        continue
    }

    let request = VNClassifyImageRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
    } catch {
        allResults.append([])
        continue
    }

    guard let observations = request.results else {
        allResults.append([])
        continue
    }

    let labels = observations
        .filter { $0.confidence >= 0.4 }
        .map { $0.identifier }

    allResults.append(labels)
}

let json = try! JSONSerialization.data(withJSONObject: allResults, options: [])
print(String(data: json, encoding: .utf8)!)
