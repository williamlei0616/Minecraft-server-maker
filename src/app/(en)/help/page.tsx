import { HelpPage, metaFor } from '../../pages';

export const metadata = metaFor('en', 'help');

export default function Page() {
  return <HelpPage locale="en" />;
}
