"""Exporta solo reservas aceptadas; SQLite se abre siempre en modo solo lectura."""
from __future__ import annotations

import argparse
import csv
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import urllib.error
import urllib.request

DEFAULT_IDENTITY = {
    'event_title': 'BAZTANGO 20', 'date_range': '26–29 noviembre 2026',
    'venue': 'Hotel Luze "El Toro" · Berrioplano, Navarra',
}


def read_accepted(db: Path, year: str) -> list[dict]:
    # No imports de repositorios Manager que puedan migrar/escribir al conectar.
    with closing(sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True)) as con:
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA query_only=ON')
        con.execute('BEGIN')
        edition = con.execute('SELECT edition_id FROM editions WHERE year=?', (year,)).fetchone()
        if edition is None:
            raise ValueError('La base no contiene la edición solicitada.')
        identity = dict(DEFAULT_IDENTITY) if year == '2026' else {}
        raw = con.execute("SELECT param_value FROM app_params WHERE edition_id=? AND param_key='event_identity'", (edition[0],)).fetchone()
        if raw and raw[0]:
            identity.update(json.loads(raw[0]))
        if not all(str(identity.get(k, '')).strip() for k in ('event_title', 'date_range', 'venue')):
            raise ValueError('Configura título, fechas y lugar del evento en Manager.')
        # COALESCE replica la compatibilidad con ediciones antiguas del repositorio.
        rows = con.execute('''SELECT r.id_base, r.package_name, p.id_individual,
            p.full_name, p.first_name, p.last_name_1, p.last_name_2
            FROM reservations r JOIN reservation_people p ON p.reservation_id=r.reservation_id
            WHERE r.edition_id=? AND lower(COALESCE(r.status,'accepted'))='accepted'
            AND COALESCE(p.cancelled_flag,0)=0 ORDER BY p.id_individual''', (edition[0],)).fetchall()
    items, seen = [], set()
    for row in rows:
        qr = str(row['id_individual'] or '').strip()
        name = str(row['full_name'] or '').strip() or ' '.join(
            str(row[k] or '').strip() for k in ('first_name', 'last_name_1', 'last_name_2')).strip()
        if not qr or len(qr) > 500 or not name or qr in seen:
            raise ValueError('Hay identificadores duplicados, vacíos o personas sin nombre; exportación cancelada.')
        seen.add(qr)
        items.append({
            'source': 'baztango-manager', 'sourceEdition': year,
            'reservationId': str(row['id_base']), 'passId': qr, 'qrValue': qr,
            'holderName': name, 'eventName': identity['event_title'],
            'organizationName': 'BAZTANGO', 'passType': str(row['package_name'] or 'Entrada'),
            'dateLabel': identity['date_range'], 'venue': identity['venue'], 'status': 'valid',
        })
    return items


def load_env(path: Path) -> dict:
    # Admite las variables ya usadas por Manager sin copiarlas al repositorio.
    result = {}
    if path.is_file():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and not key.startswith('#'):
                result[key.strip()] = value.strip().strip('"\'')
    return {**result, **os.environ}


def post(endpoint: str, token: str, payload: dict) -> dict:
    request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='POST')
    # No seguir redirects al transmitir la credencial.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        raise ValueError(f'Wix devolvió HTTP {exc.code}. Comprueba que walletSync está publicado y el token vigente.') from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise ValueError('No se pudo completar la conexión con Wix; puedes repetir el mismo snapshot.') from None
    if not result.get('ok'):
        raise ValueError('Wix rechazó la sincronización; revisa el backend.')
    return result


def sync(items: list[dict], year: str, endpoint: str, token: str, allow_empty=False):
    if not items and not allow_empty:
        raise ValueError('Snapshot vacío: usa --allow-empty solo para revocar toda una edición deliberadamente.')
    snapshot = hashlib.sha256(json.dumps(items, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    common = {'edition': year, 'snapshotId': snapshot}
    post(endpoint, token, {**common, 'action': 'begin', 'count': len(items)})
    for offset in range(0, len(items), 5):
        post(endpoint, token, {**common, 'action': 'upsert', 'items': items[offset:offset + 5]})
    return post(endpoint, token, {**common, 'action': 'finish', 'passIds': [r['passId'] for r in items]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--year', default='2026')
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--output', type=Path, help='JSON o CSV privado, nunca dentro del repo')
    parser.add_argument('--sync', action='store_true')
    parser.add_argument('--prepare', action='store_true', help='Prepara exclusivamente las dos colecciones privadas Wallet')
    parser.add_argument('--allow-empty', action='store_true')
    args = parser.parse_args()
    try:
        items = read_accepted(args.db, args.year)
        print(f'{len(items)} personas aceptadas activas. Sin filtro de pago, email ni archivos de entrada.')
        if args.output:
            repo = Path(__file__).resolve().parents[1]
            dest = args.output.resolve()
            if dest == repo or repo in dest.parents:
                raise ValueError('Los datos privados deben guardarse fuera del repositorio público.')
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.suffix.lower() == '.csv':
                if not items:
                    raise ValueError('No se puede crear un CSV sin registros.')
                with dest.open('w', encoding='utf-8-sig', newline='') as stream:
                    writer = csv.DictWriter(stream, fieldnames=list(items[0]))
                    writer.writeheader()
                    writer.writerows(items)
            else:
                dest.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Exportación privada guardada.')
        if args.sync or args.prepare:
            env = load_env(args.env_file or Path('.env'))
            token = env.get('BAZTANGO_WIX_EXPORT_TOKEN', '')
            base = env.get('BAZTANGO_WIX_BASE_URL', '').rstrip('/')
            if base != 'https://www.joseba-bakartxo.com' or not token:
                raise ValueError('Falta la configuración Wix existente de Manager (base HTTPS y token).')
            endpoint = base + '/_functions/walletSync'
            if args.prepare:
                post(endpoint, token, {'edition': args.year, 'snapshotId': '0'*64, 'action': 'prepare'})
                print('Colecciones privadas preparadas.')
            if args.sync:
                report = sync(items, args.year, endpoint, token, args.allow_empty)
                print(f"Sincronización completada: {report['active']} activas, {report['revoked']} revocadas.")
        return 0
    except (ValueError, sqlite3.Error, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
