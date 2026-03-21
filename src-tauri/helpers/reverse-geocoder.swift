import CoreLocation
import Foundation

// Usage: reverse-geocoder <lat,lon> [lat,lon ...]
// Output: JSON array of objects with "ja" and "en" keys, one per coordinate pair
// Processes sequentially to avoid CLGeocoder rate limiting.

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: reverse-geocoder <lat,lon> [lat,lon ...]\n", stderr)
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
var results: [[String: String]] = Array(repeating: ["ja": "", "en": ""], count: args.count)

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

let semaphore = DispatchSemaphore(value: 0)

func processIndex(_ index: Int) {
    guard index < args.count else {
        // All done
        let json = try! JSONSerialization.data(withJSONObject: results, options: [])
        print(String(data: json, encoding: .utf8)!)
        exit(0)
        return
    }

    let coord = args[index]
    let parts = coord.split(separator: ",")
    guard parts.count == 2,
          let lat = Double(parts[0]),
          let lon = Double(parts[1]) else {
        processIndex(index + 1)
        return
    }

    let location = CLLocation(latitude: lat, longitude: lon)

    // Japanese
    let geoJa = CLGeocoder()
    geoJa.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")) { placemarks, _ in
        if let placemark = placemarks?.first {
            results[index]["ja"] = buildLocationString(placemark)
        }

        // English (after JA completes)
        let geoEn = CLGeocoder()
        geoEn.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "en_US")) { placemarks, _ in
            if let placemark = placemarks?.first {
                results[index]["en"] = buildLocationString(placemark)
            }

            // Next coordinate (sequential)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                processIndex(index + 1)
            }
        }
    }
}

DispatchQueue.main.async {
    processIndex(0)
}

RunLoop.main.run()
