import type { Metadata } from 'next';
import LegalPage from '../legal/LegalPage';
import { PRIVACY_POLICY } from './content';

export const metadata: Metadata = { title: 'Privacy policy · spaceMiner' };

export default function PrivacyPage() {
  return <LegalPage text={PRIVACY_POLICY} />;
}
