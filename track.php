<?php
declare(strict_types=1);

const ANALYTICS_TIMEZONE = 'America/Chicago';

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
$timezone = new DateTimeZone(ANALYTICS_TIMEZONE);
$now = (new DateTimeImmutable('now', $timezone))->format(DateTimeInterface::ATOM);

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
			'devices' => [],
		],
		'byIp' => [],
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
		$device = detect_device((string)($event['userAgent'] ?? ''));

		$summary['totals']['views']++;
		increment_counter($summary['totals']['ips'], $ip);
		increment_counter($summary['totals']['devices'], $device);

		if (!isset($summary['byIp'][$ip])) {
			$summary['byIp'][$ip] = [
				'views' => 0,
				'home' => 0,
				'poems' => 0,
				'devices' => [],
				'poemDetails' => [],
			];
		}
		$summary['byIp'][$ip]['views']++;
		increment_counter($summary['byIp'][$ip]['devices'], $device);

		if (!isset($summary['days'][$date])) {
			$summary['days'][$date] = [
				'views' => 0,
				'home' => 0,
				'devices' => [],
				'poems' => [],
			];
		}

		$summary['days'][$date]['views']++;
		increment_counter($summary['days'][$date]['devices'], $device);

		if ($type === 'home') {
			$summary['totals']['home']++;
			$summary['byIp'][$ip]['home']++;
			$summary['days'][$date]['home']++;
			continue;
		}

		$summary['totals']['poems']++;
		$summary['byIp'][$ip]['poems']++;
		$poemId = sanitize_text((string)($event['poemId'] ?? ''), 120) ?: 'sin-id';
		$title = sanitize_text((string)($event['title'] ?? ''), 180) ?: $poemId;

		if (!isset($summary['byIp'][$ip]['poemDetails'][$poemId])) {
			$summary['byIp'][$ip]['poemDetails'][$poemId] = [
				'title' => $title,
				'views' => 0,
			];
		}
		if ($title !== $poemId) {
			$summary['byIp'][$ip]['poemDetails'][$poemId]['title'] = $title;
		}
		$summary['byIp'][$ip]['poemDetails'][$poemId]['views']++;

		if (!isset($summary['days'][$date]['poems'][$poemId])) {
			$summary['days'][$date]['poems'][$poemId] = [
				'title' => $title,
				'views' => 0,
				'ips' => [],
				'devices' => [],
				'ipDevices' => [],
			];
		}

		if ($title !== $poemId) {
			$summary['days'][$date]['poems'][$poemId]['title'] = $title;
		}

		$summary['days'][$date]['poems'][$poemId]['views']++;
		increment_counter($summary['days'][$date]['poems'][$poemId]['ips'], $ip);
		increment_counter($summary['days'][$date]['poems'][$poemId]['devices'], $device);

		if (!isset($summary['days'][$date]['poems'][$poemId]['ipDevices'][$ip])) {
			$summary['days'][$date]['poems'][$poemId]['ipDevices'][$ip] = [];
		}
		increment_counter($summary['days'][$date]['poems'][$poemId]['ipDevices'][$ip], $device);
	}

	fclose($handle);
	krsort($summary['days']);
	sort_ip_counts($summary['totals']['ips']);
	sort_ip_counts($summary['totals']['devices']);
	uasort($summary['byIp'], static function ($a, $b): int {
		return ((int)($b['views'] ?? 0)) <=> ((int)($a['views'] ?? 0));
	});

	foreach ($summary['byIp'] as &$ipData) {
		sort_ip_counts($ipData['devices']);
		uasort($ipData['poemDetails'], static function ($a, $b): int {
			return ((int)($b['views'] ?? 0)) <=> ((int)($a['views'] ?? 0));
		});
	}
	unset($ipData);

	foreach ($summary['days'] as &$day) {
		sort_ip_counts($day['devices']);

		uasort($day['poems'], static function ($a, $b): int {
			return ((int)($b['views'] ?? 0)) <=> ((int)($a['views'] ?? 0));
		});

		foreach ($day['poems'] as &$poem) {
			sort_ip_counts($poem['ips']);
			sort_ip_counts($poem['devices']);
			foreach ($poem['ipDevices'] as &$devices) {
				sort_ip_counts($devices);
			}
			unset($devices);
		}
		unset($poem);
	}
	unset($day);

	return $summary;
}

function detect_device(string $userAgent): string {
	$ua = strtolower($userAgent);

	if ($ua === '') {
		return 'Desconocido';
	}

	if (strpos($ua, 'curl/') !== false) {
		return 'Servidor / curl';
	}

	if (strpos($ua, 'bot') !== false || strpos($ua, 'crawl') !== false || strpos($ua, 'spider') !== false) {
		return 'Bot / crawler';
	}

	$device = 'Desconocido';
	if (strpos($ua, 'iphone') !== false) {
		$device = 'iPhone';
	} elseif (strpos($ua, 'ipad') !== false) {
		$device = 'iPad';
	} elseif (strpos($ua, 'android') !== false) {
		$device = 'Android';
	} elseif (strpos($ua, 'windows') !== false) {
		$device = 'Windows';
	} elseif (strpos($ua, 'mac os') !== false || strpos($ua, 'macintosh') !== false) {
		$device = 'Mac';
	} elseif (strpos($ua, 'linux') !== false) {
		$device = 'Linux';
	}

	$browser = 'Navegador desconocido';
	if (strpos($ua, 'edg/') !== false || strpos($ua, 'edga/') !== false || strpos($ua, 'edgios/') !== false) {
		$browser = 'Edge';
	} elseif (strpos($ua, 'opr/') !== false || strpos($ua, 'opera') !== false) {
		$browser = 'Opera';
	} elseif (strpos($ua, 'firefox/') !== false || strpos($ua, 'fxios/') !== false) {
		$browser = 'Firefox';
	} elseif (strpos($ua, 'crios/') !== false || strpos($ua, 'chrome/') !== false || strpos($ua, 'chromium/') !== false) {
		$browser = 'Chrome';
	} elseif (strpos($ua, 'safari/') !== false) {
		$browser = 'Safari';
	}

	return "{$device} / {$browser}";
}

function event_date(string $time): string {
	try {
		$date = new DateTimeImmutable($time);
		return $date->setTimezone(new DateTimeZone(ANALYTICS_TIMEZONE))->format('Y-m-d');
	} catch (Exception $error) {
		return (new DateTimeImmutable('now', new DateTimeZone(ANALYTICS_TIMEZONE)))->format('Y-m-d');
	}
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
	$byIp = $summary['byIp'] ?? [];

	$lines[] = 'Ultima actualizacion: ' . ($summary['lastUpdated'] ?? '-');
	$lines[] = '';

	if (!$days) {
		$lines[] = 'Sin visitas registradas';
	} else {
		foreach ($days as $date => $day) {
			$lines[] = 'DIA: ' . $date;
			$lines[] = 'Visitas del dia: ' . (int)($day['views'] ?? 0);
			$lines[] = 'Inicio: ' . (int)($day['home'] ?? 0);
			$lines[] = 'Dispositivos del dia:';
			append_counter_lines($lines, $day['devices'] ?? [], '- ', 'entrada', 'entradas', '- Sin dispositivos registrados');
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
					$lines[] = '  Dispositivos:';
					append_counter_lines(
						$lines,
						$data['devices'] ?? [],
						'  - ',
						'entrada',
						'entradas',
						'  - Sin dispositivos registrados'
					);
					$lines[] = '  IPs:';

					$ips = $data['ips'] ?? [];
					if (!$ips) {
						$lines[] = '  - Sin IP registrada';
					} else {
						foreach ($ips as $ip => $count) {
							$entryLabel = (int)$count === 1 ? 'entrada' : 'entradas';
							$lines[] = "  - {$ip}: {$count} {$entryLabel}";
							$lines[] = '    Dispositivos:';
							append_counter_lines(
								$lines,
								$data['ipDevices'][$ip] ?? [],
								'    - ',
								'entrada',
								'entradas',
								'    - Sin dispositivos registrados'
							);
							$lines[] = '';
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
			$lines[] = '';
		}
	}

	$lines[] = '';
	$lines[] = 'Dispositivos totales:';
	append_counter_lines(
		$lines,
		$totals['devices'] ?? [],
		'- ',
		'entrada',
		'entradas',
		'- Sin dispositivos registrados'
	);
	$lines[] = '';
	$lines[] = 'RESUMEN POR IP';

	if (!$byIp) {
		$lines[] = '- Sin IPs registradas';
	} else {
		foreach ($byIp as $ip => $data) {
			$views = (int)($data['views'] ?? 0);
			$entryLabel = $views === 1 ? 'entrada total' : 'entradas totales';
			$lines[] = "- {$ip}: {$views} {$entryLabel}";
			$lines[] = '  Inicio: ' . (int)($data['home'] ?? 0);
			$lines[] = '  Poemas abiertos: ' . (int)($data['poems'] ?? 0);
			$lines[] = '  Dispositivos:';
			append_counter_lines(
				$lines,
				$data['devices'] ?? [],
				'  - ',
				'entrada',
				'entradas',
				'  - Sin dispositivos registrados'
			);
			$lines[] = '  Poemas visitados:';

			$poems = $data['poemDetails'] ?? [];
			if (!$poems) {
				$lines[] = '  - Sin poemas abiertos';
			} else {
				foreach ($poems as $poemId => $poemData) {
					$title = (string)($poemData['title'] ?? $poemId);
					$count = (int)($poemData['views'] ?? 0);
					$entryLabel = $count === 1 ? 'entrada' : 'entradas';
					$lines[] = "  - {$title} ({$poemId}): {$count} {$entryLabel}";
				}
			}

			$lines[] = '';
		}
	}

	return implode(PHP_EOL, $lines) . PHP_EOL;
}

function append_counter_lines(
	array &$lines,
	array $counts,
	string $prefix,
	string $singleLabel,
	string $pluralLabel,
	string $emptyLine
): void {
	if (!$counts) {
		$lines[] = $emptyLine;
		return;
	}

	foreach ($counts as $label => $count) {
		$count = (int)$count;
		$entryLabel = $count === 1 ? $singleLabel : $pluralLabel;
		$lines[] = "{$prefix}{$label}: {$count} {$entryLabel}";
	}
}
