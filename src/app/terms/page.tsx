import type { Metadata } from 'next';
import LegalPage from '../legal/LegalPage';
import { TERMS_OF_USE } from './content';

export const metadata: Metadata = { title: 'Terms of use · spaceMiner' };

export default function TermsPage() {
  return <LegalPage text={TERMS_OF_USE} />;
}
