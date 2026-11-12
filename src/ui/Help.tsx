'use client';

// The help page: the most common problems, each with a stable anchor (/help/#java) so the
// start scripts, the README and the builder can link straight to a topic.
import { useEffect, useState } from 'react';
import { loadVersions, type VersionsFile } from '@/core';
import { useI18n } from '@/i18n/I18n';
import { BASE, EULA_URL, LangNotice, SiteFooter, SiteHeader } from './shell';
import { javaRanges } from './javaTable';

const ADOPTIUM_URL = 'https://adoptium.net/temurin/releases/';

function JavaTable() {
  const { m, t } = useI18n();
  const [versions, setVersions] = useState<VersionsFile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadVersions(`${BASE}/versions.json`).then(setVersions, () => setFailed(true));
  }, []);

  if (failed) return <p className="msg note">{m.help.javaTableFailed}</p>;
  if (!versions) return <p className="msg note">{m.help.javaTableLoading}</p>;
  return (
    <table className="jtable">
      <caption>{m.help.javaTableTitle}</caption>
      <thead>
        <tr>
          <th scope="col">{m.help.javaTableVersion}</th>
          <th scope="col">{m.help.javaTableJava}</th>
        </tr>
      </thead>
      <tbody>
        {javaRanges(versions.versions).map((r) => (
          <tr key={r.java}>
            <td>
              {r.from === r.to ? r.from : t(m.help.javaTableRange, { from: r.from, to: r.to })}
            </td>
            <td>Java {r.java}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Help() {
  const { m, rich } = useI18n();
  const links = {
    adoptium: (c: string) => (
      <a href={ADOPTIUM_URL} target="_blank" rel="noopener noreferrer">
        {c}
      </a>
    ),
    eula: (c: string) => (
      <a href={EULA_URL} target="_blank" rel="noopener noreferrer">
        {c}
      </a>
    ),
  };

  return (
    <>
      <SiteHeader page="help" />
      <LangNotice page="help" />
      <main className="helpmain">
        <div className="sheet helpsheet">
          <div className="intro">
            <h2>{m.site.help}</h2>
            <p>{m.help.intro}</p>
          </div>
          <nav className="toc" aria-label={m.help.toc}>
            <h3>{m.help.toc}</h3>
            <ol>
              {m.help.topics.map((topic) => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`}>{topic.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          {m.help.topics.map((topic) => (
            <section
              className="topic"
              id={topic.id}
              key={topic.id}
              aria-labelledby={`t-${topic.id}`}
            >
              <h3 id={`t-${topic.id}`}>{topic.title}</h3>
              {topic.body.map((p, i) => (
                <p key={`b${i}`}>{rich(p, {}, links)}</p>
              ))}
              {topic.steps && (
                <ol className="steps">
                  {topic.steps.map((s, i) => (
                    <li key={`s${i}`}>
                      <p>{rich(s, {}, links)}</p>
                    </li>
                  ))}
                </ol>
              )}
              {topic.id === 'java' && <JavaTable />}
              {topic.after?.map((p, i) => (
                <p key={`a${i}`}>{rich(p, {}, links)}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
