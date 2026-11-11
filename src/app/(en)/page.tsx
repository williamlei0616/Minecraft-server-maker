import { HomePage, metaFor } from '../pages';

export const metadata = metaFor('en', 'home');

export default function Page() {
  return <HomePage locale="en" />;
}
