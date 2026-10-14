<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	http_response_code(405);
	echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
	exit;
}

$rawBody = file_get_contents('php://input') ?: '';
if (strlen($rawBody) > 4096) {
	http_response_code(413);
	echo json_encode(['ok' => false, 'error' => 'payload_too_large']);
	exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
	http_response_code(400);
	echo json_encode(['ok' => false, 'error' => 'invalid_json']);
	exit;
}

$type = sanitize_text((string)($payload['type'] ?? ''), 24);
if (!in_array($type, ['home', 'poem'], true)) {
	http_response_code(400);
	echo json_encode(['ok' => false, 'error' => 'invalid_type']);
	exit;
}

$poemId = $type === 'poem' ? sanitize_text((string)($payload['poemId'] ?? ''), 120) : '';
$title = $type === 'poem' ? sanitize_text((string)($payload['title'] ?? ''), 180) : '';
$path = sanitize_text((string)($payload['path'] ?? ''), 180);
$referrer = sanitize_text((string)($payload['referrer'] ?? ''), 240);
$ip = client_ip();
$userAgent = sanitize_text((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 240);
$now = gmdate('c');

$analyticsDir = '/var/log/literalia-analytics';
if (!is_dir($analyticsDir) && !mkdir($analyticsDir, 0775, true) && !is_dir($analyticsDir)) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'error' => 'analytics_dir_unavailable']);
	exit;
}

$event = [
	'time' => $now,
	'ip' => $ip,
	'type' => $type,
	'poemId' => $poemId,
	'title' => $title,
	'path' => $path,
	'referrer' => $referrer,
	'userAgent' => $userAgent,
];

$lockHandle = fopen($analyticsDir . DIRECTORY_SEPARATOR . 'analytics.lock', 'c');
if (!$lockHandle) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'error' => 'lock_unavailable']);
	exit;
}

flock($lockHandle, LOCK_EX);

file_put_contents(
	$analyticsDir . DIRECTORY_SEPARATOR . 'events.log',
	json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
	FILE_APPEND | LOCK_EX
);

$summaryPath = $analyticsDir . DIRECTORY_SEPARATOR . 'summary.json';
$summary = [
	'total' => 0,
	'home' => 0,
	'poems' => [],
	'lastUpdated' => null,
];

if (is_file($summaryPath)) {
	$existing = json_decode((string)file_get_contents($summaryPath), true);
	if (is_array($existing)) {
		$summary = array_replace_recursive($summary, $existing);
	}
}

$summary['total'] = (int)$summary['total'] + 1;
$summary['lastUpdated'] = $now;

if ($type === 'home') {
	$summary['home'] = (int)$summary['home'] + 1;
} else {
	$key = $poemId !== '' ? $poemId : 'sin-id';
	if (!isset($summary['poems'][$key]) || !is_array($summary['poems'][$key])) {
		$summary['poems'][$key] = ['title' => $title, 'views' => 0];
	}
	$summary['poems'][$key]['title'] = $title !== '' ? $title : ($summary['poems'][$key]['title'] ?? '');
	$summary['poems'][$key]['views'] = (int)$summary['poems'][$key]['views'] + 1;
}

file_put_contents(
	$summaryPath,
	json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);
file_put_contents($analyticsDir . DIRECTORY_SEPARATOR . 'summary.txt', render_summary($summary));

flock($lockHandle, LOCK_UN);
fclose($lockHandle);

echo json_encode(['ok' => true]);

function sanitize_text(string $value, int $maxLength): string {
	$value = trim(preg_replace('/[^\P{C}\t ]+/u', '', $value) ?? '');
	$value = str_replace(["\r", "\n", "\t"], ' ', $value);
	if (function_exists('mb_substr')) {
		return mb_substr($value, 0, $maxLength);
	}
	return substr($value, 0, $maxLength);
}

function client_ip(): string {
	$remoteAddr = sanitize_text((string)($_SERVER['REMOTE_ADDR'] ?? ''), 64);
	if ($remoteAddr !== '') {
		return $remoteAddr;
	}
	return 'unknown';
}

function render_summary(array $summary): string {
	$lines = [];
	$lines[] = 'Última actualización: ' . ($summary['lastUpdated'] ?? '-');
	$lines[] = 'Visitas totales: ' . (int)($summary['total'] ?? 0);
	$lines[] = 'Inicio: ' . (int)($summary['home'] ?? 0);
	$lines[] = '';
	$lines[] = 'Poemas abiertos:';

	$poems = $summary['poems'] ?? [];
	uasort($poems, static function ($a, $b): int {
		return ((int)($b['views'] ?? 0)) <=> ((int)($a['views'] ?? 0));
	});

	if (!$poems) {
		$lines[] = '- Sin aperturas registradas';
	} else {
		foreach ($poems as $id => $data) {
			$title = (string)($data['title'] ?? $id);
			$views = (int)($data['views'] ?? 0);
			$lines[] = "- {$title} ({$id}): {$views}";
		}
	}

	return implode(PHP_EOL, $lines) . PHP_EOL;
}
