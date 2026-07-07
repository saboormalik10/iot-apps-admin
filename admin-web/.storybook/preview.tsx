import type { Preview } from '@storybook/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import '../styles/tokens.css';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: 'app',
      values: [{ name: 'app', value: 'hsl(60 14% 99%)' }],
    },
    a11y: { config: {} },
  },
  globalTypes: {
    theme: {
      description: 'Theme',
      defaultValue: 'light',
      toolbar: { icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  decorators: [
    (Story, context) => {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', context.globals.theme as string);
      }
      return (
        <NextIntlClientProvider locale="en" messages={messages}>
          <div className="p-6">
            <Story />
          </div>
        </NextIntlClientProvider>
      );
    },
  ],
};

export default preview;
