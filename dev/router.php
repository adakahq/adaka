<?php
header('Content-Type: application/json');
echo json_encode([
    'method' => $_SERVER['REQUEST_METHOD'],
    'path'   => parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH),
    'query'  => $_GET,
    'body'   => json_decode(file_get_contents('php://input'), true),
    'time'   => date('c'),
], JSON_PRETTY_PRINT);

// php -S 127.0.0.1:8080 dev/router.php