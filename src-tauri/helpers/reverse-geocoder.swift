import CoreLocation
import Foundation

// Usage: reverse-geocoder <lat,lon>
// Output: JSON object with "ja" and "en" keys
// Single coordinate only. Caller is responsible for rate limiting.

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: reverse-geocoder <lat,lon>\n", stderr)
    // Return empty result instead of error for graceful handling
    print("{\"ja\":\"\",\"en\":\"\"}")
    exit(0)
}

let coord = CommandLine.arguments[1]
let parts = coord.split(separator: ",")
guard parts.count == 2,
      let lat = Double(parts[0]),
      let lon = Double(parts[1]) else {
    print("{\"ja\":\"\",\"en\":\"\"}")
    exit(0)
}

func buildLocationString(_ placemark: CLPlacemark) -> String {
    var locationParts: [String] = []
    if let country = placemark.country { locationParts.append(country) }
    if let admin = placemark.administrativeArea { locationParts.append(admin) }
    if let locality = placemark.locality, locality != placemark.administrativeArea {
        locationParts.append(locality)
    }
    if let sub = placemark.subLocality { locationParts.append(sub) }
    if let name = placemark.name,
       name != placemark.locality,
       name != placemark.subLocality {
        locationParts.append(name)
    }
    return locationParts.joined(separator: " ")
}

let location = CLLocation(latitude: lat, longitude: lon)
var result: [String: String] = ["ja": "", "en": ""]
var pending = 2

let geoJa = CLGeocoder()
geoJa.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")) { placemarks, _ in
    if let placemark = placemarks?.first {
        result["ja"] = buildLocationString(placemark)
    }
    pending -= 1
    if pending == 0 {
        let json = try! JSONSerialization.data(withJSONObject: result, options: [])
        print(String(data: json, encoding: .utf8)!)
        exit(0)
    }
}

let geoEn = CLGeocoder()
DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
    geoEn.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "en_US")) { placemarks, _ in
        if let placemark = placemarks?.first {
            result["en"] = buildLocationString(placemark)
        }
        pending -= 1
        if pending == 0 {
            let json = try! JSONSerialization.data(withJSONObject: result, options: [])
            print(String(data: json, encoding: .utf8)!)
            exit(0)
        }
    }
}

RunLoop.main.run()
