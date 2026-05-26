import { useEffect, useMemo, useState } from 'react'
import Roleplay from './Roleplay'
import { ROLEPLAYS, findRoleplayBySlug, type Roleplay as RoleplayConfig } from './roleplays'
import './App.css'

function readUrl(): { slug: string | null; embed: boolean } {
  const params = new URLSearchParams(window.location.search)
  return {
    slug: params.get('agent'),
    embed: params.get('embed') === '1' || params.get('embed') === 'true',
  }
}

function buildEmbedSrc(slug: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('agent', slug)
  url.searchParams.set('embed', '1')
  return url.toString()
}

function buildShareUrl(slug: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('agent', slug)
  return url.toString()
}

function buildIframeSnippet(slug: string, height: number): string {
  const src = buildEmbedSrc(slug)
  return `<iframe
  src="${src}"
  width="100%"
  height="${height}"
  allow="microphone"
  style="border:0;border-radius:16px;max-width:640px;display:block;margin:0 auto;"
  title="Mental Health First Response practice"
></iframe>`
}

export default function App() {
  const initial = useMemo(readUrl, [])
  const [selectedSlug, setSelectedSlug] = useState<string>(
    findRoleplayBySlug(initial.slug).slug,
  )
  const embed = initial.embed

  const selected = findRoleplayBySlug(selectedSlug)

  useEffect(() => {
    if (embed) return
    const url = new URL(window.location.href)
    url.searchParams.set('agent', selectedSlug)
    window.history.replaceState({}, '', url.toString())
  }, [selectedSlug, embed])

  if (embed) {
    return (
      <div className="embed-root">
        <Roleplay
          key={selected.slug}
          agentId={selected.agentId}
          title={selected.name}
          subtitle={selected.subtitle}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand-mark" />
          <div>
            <h1 className="brand-title">Emotional Pulse</h1>
            <p className="brand-sub">Roleplay practice</p>
          </div>
        </header>

        <nav className="rp-list" aria-label="Available roleplays">
          <p className="rp-list-label">Roleplays</p>
          {ROLEPLAYS.map((r) => (
            <button
              key={r.slug}
              type="button"
              className={`rp-item ${r.slug === selectedSlug ? 'active' : ''}`}
              onClick={() => setSelectedSlug(r.slug)}
            >
              <span className="rp-item-name">{r.name}</span>
              <span className="rp-item-sub">{r.subtitle}</span>
            </button>
          ))}
        </nav>

        <footer className="sidebar-footer">
          <p>
            Practice Mental Health First Response using the LIFT framework — Listen, Inquire, Find support,
            Thank.
          </p>
        </footer>
      </aside>

      <main className="main">
        <div className="rp-frame">
          <Roleplay
            key={selected.slug}
            agentId={selected.agentId}
            title={selected.name}
            subtitle={selected.subtitle}
          />
        </div>

        <SharePanel roleplay={selected} />
      </main>
    </div>
  )
}

function SharePanel({ roleplay }: { roleplay: RoleplayConfig }) {
  const [height, setHeight] = useState(720)
  const [copied, setCopied] = useState<'iframe' | 'link' | null>(null)

  const iframeSnippet = useMemo(() => buildIframeSnippet(roleplay.slug, height), [roleplay.slug, height])
  const shareLink = useMemo(() => buildShareUrl(roleplay.slug), [roleplay.slug])

  const copy = async (text: string, which: 'iframe' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="share-panel" aria-label="Embed and share settings">
      <header className="share-head">
        <h2>Share & embed</h2>
        <p>Paste the iframe snippet into your LMS, or share the direct link.</p>
      </header>

      <div className="share-body">
        <div className="share-block">
          <div className="share-block-head">
            <label htmlFor="embed-snippet">Iframe embed</label>
            <div className="height-control">
              <span>Height</span>
              <input
                type="number"
                min={400}
                max={1400}
                step={20}
                value={height}
                onChange={(e) => setHeight(Math.max(400, Math.min(1400, Number(e.target.value) || 720)))}
              />
              <span>px</span>
            </div>
          </div>
          <textarea id="embed-snippet" readOnly value={iframeSnippet} rows={7} spellCheck={false} />
          <button
            type="button"
            className="copy-button"
            onClick={() => void copy(iframeSnippet, 'iframe')}
          >
            {copied === 'iframe' ? 'Copied ✓' : 'Copy iframe'}
          </button>
        </div>

        <div className="share-block">
          <div className="share-block-head">
            <label htmlFor="share-link">Direct link</label>
          </div>
          <input id="share-link" readOnly value={shareLink} spellCheck={false} />
          <button type="button" className="copy-button" onClick={() => void copy(shareLink, 'link')}>
            {copied === 'link' ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      </div>

      <p className="share-note">
        The iframe sets <code>allow="microphone"</code> so voice mode works in the LMS. Make sure the LMS
        doesn't strip iframe attributes.
      </p>
    </section>
  )
}
