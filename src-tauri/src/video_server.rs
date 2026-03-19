use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::thread;

use tiny_http::{Header, Response, Server, StatusCode};

use crate::{mime_for_ext, thumbnail};

/// Start a local HTTP server for video streaming. Returns the port.
pub fn start() -> u16 {
    let server = Server::http("127.0.0.1:0").expect("Failed to start video server");
    let port = server.server_addr().to_ip().unwrap().port();

    thread::spawn(move || {
        for request in server.incoming_requests() {
            thread::spawn(move || {
                handle_request(request);
            });
        }
    });

    port
}

fn handle_request(request: tiny_http::Request) {
    // URL path is the absolute file path (percent-encoded)
    let raw_path = request.url().to_string();
    let decoded = percent_encoding::percent_decode_str(&raw_path)
        .decode_utf8_lossy()
        .to_string();

    let file_path = Path::new(&decoded);

    if !file_path.exists() || !file_path.is_file() {
        let _ = request.respond(Response::from_string("Not found").with_status_code(StatusCode(404)));
        return;
    }

    let file_size = match fs::metadata(file_path) {
        Ok(m) => m.len(),
        Err(_) => {
            let _ = request.respond(Response::from_string("Error").with_status_code(StatusCode(500)));
            return;
        }
    };

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // HEIC: convert to JPEG and serve the cached version
    if thumbnail::is_heic_ext(&ext) {
        match thumbnail::convert_heic_cached(file_path) {
            Ok(cached_path) => {
                let bytes = fs::read(&cached_path).unwrap_or_default();
                let ct = Header::from_bytes("Content-Type", "image/jpeg").unwrap();
                let ac = Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let resp = Response::from_data(bytes)
                    .with_status_code(StatusCode(200))
                    .with_header(ct)
                    .with_header(ac);
                let _ = request.respond(resp);
                return;
            }
            Err(_) => {
                let _ = request.respond(
                    Response::from_string("HEIC conversion failed")
                        .with_status_code(StatusCode(500)),
                );
                return;
            }
        }
    }

    let mime = mime_for_ext(&ext);

    // Parse Range header
    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("range"))
        .map(|h| h.value.as_str().to_string());

    let (start, end) = if let Some(range_str) = &range_header {
        let range = range_str.trim_start_matches("bytes=");
        let parts: Vec<&str> = range.split('-').collect();
        let s: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
        let e: u64 = parts
            .get(1)
            .and_then(|v| if v.is_empty() { None } else { v.parse().ok() })
            .unwrap_or(file_size - 1);
        (s, e.min(file_size - 1))
    } else {
        (0, file_size - 1)
    };

    let length = end - start + 1;

    let mut file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => {
            let _ = request.respond(Response::from_string("Read error").with_status_code(StatusCode(500)));
            return;
        }
    };

    if start > 0 {
        let _ = file.seek(SeekFrom::Start(start));
    }

    let mut buf = vec![0u8; length as usize];
    let _ = file.read_exact(&mut buf);

    let content_type = Header::from_bytes("Content-Type", mime).unwrap();
    let accept_ranges = Header::from_bytes("Accept-Ranges", "bytes").unwrap();
    let access_control = Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

    if range_header.is_some() {
        let content_range = Header::from_bytes(
            "Content-Range",
            format!("bytes {}-{}/{}", start, end, file_size),
        )
        .unwrap();

        let response = Response::from_data(buf)
            .with_status_code(StatusCode(206))
            .with_header(content_type)
            .with_header(accept_ranges)
            .with_header(content_range)
            .with_header(access_control);
        let _ = request.respond(response);
    } else {
        let response = Response::from_data(buf)
            .with_status_code(StatusCode(200))
            .with_header(content_type)
            .with_header(accept_ranges)
            .with_header(access_control);
        let _ = request.respond(response);
    }
}
