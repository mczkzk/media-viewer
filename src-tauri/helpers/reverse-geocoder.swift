import CoreLocation
import Foundation

// Usage: reverse-geocoder <lat,lon> [lat,lon ...]
// Output: JSON array of location strings, one per coordinate pair

// Force Japanese locale for place names
setlocale(LC_ALL, "ja_JP.UTF-8")
UserDefaults.standard.set(["ja"], forKey: "AppleLanguages")

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: reverse-geocoder <lat,lon> [lat,lon ...]\n", stderr)
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
var results: [String] = Array(repeating: "", count: args.count)
var pending = args.count

for (index, coord) in args.enumerated() {
    let parts = coord.split(separator: ",")
    guard parts.count == 2,
          let lat = Double(parts[0]),
          let lon = Double(parts[1]) else {
        pending -= 1
        continue
    }

    let location = CLLocation(latitude: lat, longitude: lon)
    let geocoder = CLGeocoder()

    // Stagger requests to avoid rate limiting
    let delay = Double(index) * 0.15

    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        geocoder.reverseGeocodeLocation(location) { placemarks, error in
            defer {
                pending -= 1
                if pending == 0 {
                    let json = try! JSONSerialization.data(withJSONObject: results, options: [])
                    print(String(data: json, encoding: .utf8)!)
                    exit(0)
                }
            }

            guard let placemark = placemarks?.first else { return }

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

            results[index] = locationParts.joined(separator: " ")
        }
    }
}

// Run the main run loop to allow async callbacks
RunLoop.main.run()
