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

$eventsPath = $analyticsDir . DIRECTORY_SEPARATOR . 'events.log';
file_put_contents(
	$eventsPath,
	json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
	FILE_APPEND | LOCK_EX
);

$summary = build_summary($eventsPath, $now);

file_put_contents(
	$analyticsDir . DIRECTORY_SEPARATOR . 'summary.json',
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

function build_summary(string $eventsPath, string $lastUpdated): array {
	$summary = [
		'lastUpdated' => $lastUpdated,
		'totals' => [
			'views' => 0,
			'home' => 0,
			'poems' => 0,
			'ips' => [],
		],
		'days' => [],
	];

	$handle = fopen($eventsPath, 'r');
	if (!$handle) {
		return $summary;
	}

	while (($line = fgets($handle)) !== false) {
		$event = json_decode(trim($line), true);
		if (!is_array($event)) {
			continue;
		}

		$type = (string)($event['type'] ?? '');
		if (!in_array($type, ['home', 'poem'], true)) {
			continue;
		}

		$date = event_date((string)($event['time'] ?? ''));
		$ip = sanitize_text((string)($event['ip'] ?? 'unknown'), 64) ?: 'unknown';

		$summary['totals']['views']++;
		increment_counter($summary['totals']['ips'], $ip);

		if (!isset($summary['days'][$date])) {
			$summary['days'][$date] = [
				'views' => 0,
				'home' => 0,
				'poems' => [],
			];
		}

		$summary['days'][$date]['views']++;

		if ($type === 'home') {
			$summary['totals']['home']++;
			$summary['days'][$date]['home']++;
			continue;
		}

		$summary['totals']['poems']++;
		$poemId = sanitize_text((string)($event['poemId'] ?? ''), 120) ?: 'sin-id';
		$title = sanitize_text((string)($event['title'] ?? ''), 180) ?: $poemId;

		if (!isset($summary['days'][$date]['poems'][$poemId])) {
			$summary['days'][$date]['poems'][$poemId] = [
				'title' => $title,
				'views' => 0,
				'ips' => [],
			];
		}

		if ($title !== $poemId) {
			$summary['days'][$date]['poems'][$poemId]['title'] = $title;
		}

		$summary['days'][$date]['poems'][$poemId]['views']++;
		increment_counter($summary['days'][$date]['poems'][$poemId]['ips'], $ip);
	}

	fclose($handle);
	krsort($summary['days']);
	sort_ip_counts($summary['totals']['ips']);

	foreach ($summary['days'] as &$day) {
		uasort($day['poems'], static function ($a, $b): int {
			return ((int)($b['views'] ?? 0)) <=> ((int)($a['views'] ?? 0));
		});

		foreach ($day['poems'] as &$poem) {
			sort_ip_counts($poem['ips']);
		}
		unset($poem);
	}
	unset($day);

	return $summary;
}

function event_date(string $time): string {
	if (preg_match('/^\d{4}-\d{2}-\d{2}/', $time, $matches)) {
		return $matches[0];
	}
	return gmdate('Y-m-d');
}

function increment_counter(array &$counts, string $key): void {
	if (!isset($counts[$key])) {
		$counts[$key] = 0;
	}
	$counts[$key]++;
}

function sort_ip_counts(array &$counts): void {
	arsort($counts, SORT_NUMERIC);
}

function render_summary(array $summary): string {
	$lines = [];
	$totals = $summary['totals'] ?? [];
	$days = $summary['days'] ?? [];

	$lines[] = 'Ultima actualizacion: ' . ($summary['lastUpdated'] ?? '-');
	$lines[] = '';

	if (!$days) {
		$lines[] = 'Sin visitas registradas';
	} else {
		foreach ($days as $date => $day) {
			$lines[] = 'DIA: ' . $date;
			$lines[] = 'Visitas del dia: ' . (int)($day['views'] ?? 0);
			$lines[] = 'Inicio: ' . (int)($day['home'] ?? 0);
			$lines[] = '';
			$lines[] = 'Poemas abiertos:';

			$poems = $day['poems'] ?? [];
			if (!$poems) {
				$lines[] = '- Sin aperturas registradas';
			} else {
				foreach ($poems as $id => $data) {
					$title = (string)($data['title'] ?? $id);
					$views = (int)($data['views'] ?? 0);
					$lines[] = "- {$title} ({$id}): {$views}";
					$lines[] = '  IPs:';

					$ips = $data['ips'] ?? [];
					if (!$ips) {
						$lines[] = '  - Sin IP registrada';
					} else {
						foreach ($ips as $ip => $count) {
							$entryLabel = (int)$count === 1 ? 'entrada' : 'entradas';
							$lines[] = "  - {$ip}: {$count} {$entryLabel}";
						}
					}
				}
			}

			$lines[] = '';
		}
	}

	$lines[] = 'RESUMEN TOTAL DE TODO EL TIEMPO';
	$lines[] = 'Visitas totales: ' . (int)($totals['views'] ?? 0);
	$lines[] = 'Inicio total: ' . (int)($totals['home'] ?? 0);
	$lines[] = 'Poemas abiertos total: ' . (int)($totals['poems'] ?? 0);
	$lines[] = '';
	$lines[] = 'IPs totales:';

	$ips = $totals['ips'] ?? [];
	if (!$ips) {
		$lines[] = '- Sin IPs registradas';
	} else {
		foreach ($ips as $ip => $count) {
			$entryLabel = (int)$count === 1 ? 'entrada' : 'entradas';
			$lines[] = "- {$ip}: {$count} {$entryLabel}";
		}
	}

	return implode(PHP_EOL, $lines) . PHP_EOL;
}
