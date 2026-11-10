import Link from 'next/link';
import Markdown from './Markdown';

/** Layout for the privacy policy and terms: a scrollable page that works logged in or out. */
export default function LegalPage({ text }: { text: string }) {
  return (
    <div className="legal-scroll">
      <main className="panel legal">
        <nav className="tiny legal-nav">
          <Link href="/">◀ BACK TO THE GAME</Link>
          <span>
            <Link href="/privacy">PRIVACY</Link> · <Link href="/terms">TERMS</Link>
          </span>
        </nav>
        <Markdown text={text} />
      </main>
    </div>
  );
}
