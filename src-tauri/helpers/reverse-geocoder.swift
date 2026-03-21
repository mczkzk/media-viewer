import Foundation
import MapKit
import CoreLocation

// Persistent reverse-geocoder using MKReverseGeocodingRequest (macOS 26+).
// Reads coordinates from stdin, writes results to stdout.
// Input:  one "lat,lon" per line
// Output: one JSON line per input: {"ja":"日本 長野県 軽井沢町","error":""}
// Send "quit" to exit.

func writeResult(_ result: [String: String]) {
    let json = try! JSONSerialization.data(withJSONObject: result, options: [])
    let out = String(data: json, encoding: .utf8)! + "\n"
    FileHandle.standardOutput.write(out.data(using: .utf8)!)
}

DispatchQueue.global().async {
    while let line = readLine() {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == "quit" {
            exit(0)
        }

        let parts = trimmed.split(separator: ",")
        guard parts.count == 2,
              let lat = Double(parts[0]),
              let lon = Double(parts[1]) else {
            writeResult(["ja": "", "error": "invalid"])
            continue
        }

        let semaphore = DispatchSemaphore(value: 0)
        let location = CLLocation(latitude: lat, longitude: lon)

        DispatchQueue.main.async {
            guard let request = MKReverseGeocodingRequest(location: location) else {
                writeResult(["ja": "", "error": "init_failed"])
                semaphore.signal()
                return
            }
            // System locale: Japanese on JP systems, English elsewhere

            request.getMapItems { mapItems, error in
                var result: [String: String] = ["ja": "", "error": ""]

                if let error = error {
                    let desc = error.localizedDescription.lowercased()
                    if desc.contains("rate") || desc.contains("network") || desc.contains("throttl") {
                        result["error"] = "rate_limit"
                    } else {
                        result["error"] = desc
                    }
                } else if let mapItem = mapItems?.first,
                          let address = mapItem.address {
                    result["ja"] = address.fullAddress
                } else {
                    result["error"] = "empty"
                }

                writeResult(result)
                semaphore.signal()
            }
        }

        semaphore.wait()
    }
    exit(0)
}

RunLoop.main.run()
