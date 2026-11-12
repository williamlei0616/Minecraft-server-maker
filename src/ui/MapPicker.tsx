'use client';

// The custom-map question: pick a folder or a .zip, read level.dat on this computer, show what
// was found and whether the chosen server version can open it. Nothing is uploaded.
import { useRef, useState } from 'react';
import { checkMapCompat, type MapVerdict, type VersionProfile } from '@/core';
import { useI18n } from '@/i18n/I18n';
import {
  readMapFromFolder,
  readMapFromZip,
  type MapFailure,
  type MapInfo,
  type ReadMapResult,
} from './readMap';

interface Props {
  info: MapInfo | null;
  /** The chosen server version's profile, or null while it loads. */
  profile: VersionProfile | null;
  serverVersion: string;
  disabled?: boolean;
  onPick: (info: MapInfo | null) => void;
}

/** The verdict for one map on one version (also used by the page to block the download). */
export function mapVerdict(info: MapInfo | null, profile: VersionProfile | null): MapVerdict {
  return info && profile ? checkMapCompat(info.dataVersion, profile) : 'unknown';
}

export function MapPicker({ info, profile, serverVersion, disabled, onPick }: Props) {
  const { m, t } = useI18n();
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MapFailure | null>(null);

  const finish = (r: ReadMapResult) => {
    setBusy(false);
    if (r.ok) {
      setFailure(null);
      onPick(r.info);
    } else {
      setFailure(r);
    }
  };
  const pickFolder = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    finish(await readMapFromFolder([...list]));
  };
  const pickZip = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    finish(await readMapFromZip(file));
  };

  const verdict = mapVerdict(info, profile);
  const mapVersion = info?.versionName ?? m.map.aNewerOne;
  const failText = (f: MapFailure): string => {
    switch (f.reason) {
      case 'zipTooBig':
        return t(m.map.fail.zipTooBig, { mb: f.megabytes });
      case 'badName':
        return t(m.map.fail.badName, { name: f.name });
      default:
        return m.map.fail[f.reason];
    }
  };

  return (
    <div className="mapbox">
      <div className="editor-bar">
        <button
          type="button"
          className="btn2"
          disabled={disabled || busy}
          onClick={() => folderRef.current?.click()}
        >
          {m.map.pickFolder}
        </button>
        <button
          type="button"
          className="btn2"
          disabled={disabled || busy}
          onClick={() => zipRef.current?.click()}
        >
          {m.map.pickZip}
        </button>
        {info && (
          <button
            type="button"
            className="btn2"
            disabled={busy}
            onClick={() => {
              setFailure(null);
              onPick(null);
            }}
          >
            {m.map.remove}
          </button>
        )}
        <input
          ref={folderRef}
          type="file"
          hidden
          multiple
          // @ts-expect-error webkitdirectory is a widely supported, non-standard attribute
          webkitdirectory=""
          onChange={(e) => {
            void pickFolder(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={zipRef}
          type="file"
          hidden
          accept=".zip,application/zip"
          onChange={(e) => {
            void pickZip(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div aria-live="polite">
        {busy && <p className="msg note">{m.map.reading}</p>}
        {failure && !busy && <p className="msg err">{failText(failure)}</p>}
      </div>

      {info && (
        <dl className="found">
          <div>
            <dt>{m.map.folderLabel}</dt>
            <dd>{info.folderName}</dd>
          </div>
          {info.levelName && info.levelName !== info.folderName && (
            <div>
              <dt>{m.map.gameName}</dt>
              <dd>{info.levelName}</dd>
            </div>
          )}
          <div>
            <dt>{m.map.savedIn}</dt>
            <dd>
              {info.versionName ?? (info.dataVersion === null ? m.map.veryOld : m.map.unknown)}
            </dd>
          </div>
        </dl>
      )}

      {info && (
        <div className="verdicts">
          {verdict === 'ok' && (
            <p className="msg note">{t(m.map.verdictOk, { server: serverVersion })}</p>
          )}
          {verdict === 'older' && (
            <p className="msg note warn">{t(m.map.verdictOlder, { server: serverVersion })}</p>
          )}
          {verdict === 'unknown' && (
            <p className="msg note">{t(m.map.verdictUnknown, { server: serverVersion })}</p>
          )}
          {verdict === 'newer' && (
            <p className="msg err">
              {t(m.map.verdictNewer, { server: serverVersion, mapVersion })}
            </p>
          )}
          {info.insidePath && (
            <p className="msg note">
              {t(m.map.inside, { path: info.insidePath, folder: info.folderName })}
            </p>
          )}
          {info.zipRoot && (
            <p className="msg note">{t(m.map.zipRoot, { folder: info.folderName })}</p>
          )}
          {info.others > 0 && <p className="msg note">{m.map.others}</p>}
          <p className="msg note">{m.map.notSaved}</p>
        </div>
      )}
    </div>
  );
}
