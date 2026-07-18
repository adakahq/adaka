<?php
/**
 * Adaka local test server — httpbin-grade endpoints for development.
 *
 * Usage:
 *   php -S 127.0.0.1:8080 dev/router.php
 *
 * Endpoints:
 *   GET  /json              — Sample JSON response
 *   GET  /headers           — Returns all request headers
 *   GET  /status/{code}     — Responds with the given HTTP status code
 *   GET  /delay/{seconds}   — Waits N seconds then responds (max 10)
 *   GET  /redirect/{n}      — Redirects N times, then returns 200
 *   GET  /basic-auth/{u}/{p}— 401 unless correct Basic auth credentials
 *   GET  /bearer            — 401 unless valid Bearer token
 *   GET  /html              — Returns an HTML page
 *   GET  /image             — Returns a 1x1 PNG
 *   ANY  /anything/*        — Echo back the full request (method, headers, body, query)
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// --- /status/{code} ---
if (preg_match('#^/status/(\d+)$#', $uri, $m)) {
    $code = (int)$m[1];
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['status' => $code]);
    return;
}

// --- /delay/{seconds} ---
if (preg_match('#^/delay/(\d+)$#', $uri, $m)) {
    $seconds = min((int)$m[1], 10);
    sleep($seconds);
    header('Content-Type: application/json');
    echo json_encode(['delayed' => $seconds, 'time' => date('c')]);
    return;
}

// --- /json ---
if ($uri === '/json') {
    header('Content-Type: application/json');
    echo json_encode([
        'slideshow' => [
            'title' => 'Sample Slide Show',
            'author' => 'Adaka',
            'slides' => [
                ['title' => 'Wake up to WonderWidgets!', 'type' => 'all'],
                ['title' => 'Overview', 'type' => 'all', 'items' => ['Item 1', 'Item 2', 'Item 3']],
            ],
        ],
    ], JSON_PRETTY_PRINT);
    return;
}

// --- /headers ---
if ($uri === '/headers') {
    header('Content-Type: application/json');
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (str_starts_with($key, 'HTTP_')) {
            $name = str_replace('_', '-', strtolower(substr($key, 5)));
            $headers[$name] = $value;
        }
    }
    echo json_encode(['headers' => $headers], JSON_PRETTY_PRINT);
    return;
}

// --- /redirect/{n} ---
if (preg_match('#^/redirect/(\d+)$#', $uri, $m)) {
    $n = (int)$m[1];
    if ($n <= 1) {
        header('Content-Type: application/json');
        echo json_encode(['redirected' => true]);
    } else {
        header('Location: /redirect/' . ($n - 1));
        http_response_code(302);
    }
    return;
}

// --- /basic-auth/{user}/{pass} ---
if (preg_match('#^/basic-auth/([^/]+)/([^/]+)$#', $uri, $m)) {
    $expectedUser = $m[1];
    $expectedPass = $m[2];
    $authUser = $_SERVER['PHP_AUTH_USER'] ?? '';
    $authPass = $_SERVER['PHP_AUTH_PW'] ?? '';
    if ($authUser === $expectedUser && $authPass === $expectedPass) {
        header('Content-Type: application/json');
        echo json_encode(['authenticated' => true, 'user' => $authUser]);
    } else {
        header('WWW-Authenticate: Basic realm="Adaka test"');
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['authenticated' => false]);
    }
    return;
}

// --- /bearer ---
if ($uri === '/bearer') {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (str_starts_with($auth, 'Bearer ') && strlen($auth) > 7) {
        header('Content-Type: application/json');
        echo json_encode(['authenticated' => true, 'token' => substr($auth, 7)]);
    } else {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['authenticated' => false, 'error' => 'Missing or invalid Bearer token']);
    }
    return;
}

// --- /html ---
if ($uri === '/html') {
    header('Content-Type: text/html; charset=utf-8');
    echo <<<'HTML'
<!DOCTYPE html>
<html>
<head><title>Adaka Test HTML</title></head>
<body>
  <h1>Hello from Adaka's test server</h1>
  <p>This is an HTML response for testing the preview tab.</p>
  <ul>
    <li>Item one</li>
    <li>Item two</li>
    <li>Item three</li>
  </ul>
</body>
</html>
HTML;
    return;
}

// --- /image ---
if ($uri === '/image') {
    header('Content-Type: image/png');
    // 1x1 red PNG
    $img = imagecreatetruecolor(1, 1);
    $red = imagecolorallocate($img, 212, 162, 78); // adaka-gold
    imagesetpixel($img, 0, 0, $red);
    imagepng($img);
    imagedestroy($img);
    return;
}

// --- /anything/* ---
if (str_starts_with($uri, '/anything')) {
    header('Content-Type: application/json');
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (str_starts_with($key, 'HTTP_')) {
            $name = str_replace('_', '-', strtolower(substr($key, 5)));
            $headers[$name] = $value;
        }
    }
    $rawBody = file_get_contents('php://input');
    $jsonBody = json_decode($rawBody, true);
    echo json_encode([
        'method' => $method,
        'url' => $_SERVER['REQUEST_URI'],
        'path' => $uri,
        'headers' => $headers,
        'query' => $_GET,
        'body' => $jsonBody ?? $rawBody,
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? null,
        'time' => date('c'),
    ], JSON_PRETTY_PRINT);
    return;
}

// --- Default: echo (backwards compatible) ---
header('Content-Type: application/json');
echo json_encode([
    'method' => $method,
    'path'   => $uri,
    'query'  => $_GET,
    'body'   => json_decode(file_get_contents('php://input'), true),
    'time'   => date('c'),
], JSON_PRETTY_PRINT);
