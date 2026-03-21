import CoreLocation
import Foundation

// Persistent reverse-geocoder: reads coordinates from stdin, writes results to stdout.
// Input:  one "lat,lon" per line
// Output: one JSON line per input: {"ja":"日本 長野県 軽井沢町","error":""}
// Send "quit" to exit.

func buildLocationString(_ placemark: CLPlacemark) -> String {
    var parts: [String] = []
    if let country = placemark.country { parts.append(country) }
    if let admin = placemark.administrativeArea { parts.append(admin) }
    if let locality = placemark.locality, locality != placemark.administrativeArea {
        parts.append(locality)
    }
    if let sub = placemark.subLocality { parts.append(sub) }
    if let name = placemark.name,
       name != placemark.locality,
       name != placemark.subLocality {
        parts.append(name)
    }
    return parts.joined(separator: " ")
}

// Read stdin on a background thread, process on main thread for CLGeocoder
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
            // Invalid input
            let out = "{\"ja\":\"\",\"error\":\"invalid\"}\n"
            FileHandle.standardOutput.write(out.data(using: .utf8)!)
            continue
        }

        let semaphore = DispatchSemaphore(value: 0)
        let location = CLLocation(latitude: lat, longitude: lon)

        DispatchQueue.main.async {
            let geocoder = CLGeocoder()
            geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")) { placemarks, error in
                var result: [String: String] = ["ja": "", "error": ""]

                if let error = error as? CLError {
                    if error.code == .network {
                        result["error"] = "rate_limit"
                    } else if error.code == .geocodeFoundNoResult {
                        result["error"] = "no_result"
                    } else {
                        result["error"] = "cl_error_\(error.code.rawValue)"
                    }
                } else if let placemark = placemarks?.first {
                    result["ja"] = buildLocationString(placemark)
                } else {
                    result["error"] = "empty"
                }

                let json = try! JSONSerialization.data(withJSONObject: result, options: [])
                var out = String(data: json, encoding: .utf8)! + "\n"
                FileHandle.standardOutput.write(out.data(using: .utf8)!)
                semaphore.signal()
            }
        }

        semaphore.wait()
    }
    exit(0)
}

RunLoop.main.run()
