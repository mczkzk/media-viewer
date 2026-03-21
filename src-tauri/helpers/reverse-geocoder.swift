import CoreLocation
import Foundation

// Usage: reverse-geocoder <lat,lon> [lat,lon ...]
// Output: JSON array of objects with "ja" and "en" keys, one per coordinate pair

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: reverse-geocoder <lat,lon> [lat,lon ...]\n", stderr)
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
var results: [[String: String]] = Array(repeating: ["ja": "", "en": ""], count: args.count)
var pending = args.count * 2  // 2 locales per coordinate

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

func checkDone() {
    if pending == 0 {
        let json = try! JSONSerialization.data(withJSONObject: results, options: [])
        print(String(data: json, encoding: .utf8)!)
        exit(0)
    }
}

for (index, coord) in args.enumerated() {
    let parts = coord.split(separator: ",")
    guard parts.count == 2,
          let lat = Double(parts[0]),
          let lon = Double(parts[1]) else {
        pending -= 2
        checkDone()
        continue
    }

    let location = CLLocation(latitude: lat, longitude: lon)
    let delay = Double(index) * 0.15

    // Japanese locale
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")) { placemarks, error in
            if let placemark = placemarks?.first {
                results[index]["ja"] = buildLocationString(placemark)
            }
            pending -= 1
            checkDone()
        }
    }

    // English locale
    DispatchQueue.main.asyncAfter(deadline: .now() + delay + 0.05) {
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "en_US")) { placemarks, error in
            if let placemark = placemarks?.first {
                results[index]["en"] = buildLocationString(placemark)
            }
            pending -= 1
            checkDone()
        }
    }
}

RunLoop.main.run()
