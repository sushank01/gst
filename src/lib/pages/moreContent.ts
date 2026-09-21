import type { PageSpec } from './types'

/** Legal pages. Summaries of posture, not the operative documents. */
export const moreLinksContent: PageSpec[] = [
  {
    slug: 'legal/privacy',
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    blurb: 'How Apragya handles the data you and your users put into the platform.',
    sections: [
      {
        kind: 'prose',
        eyebrow: 'Summary',
        title: 'The short version.',
        paragraphs: [
          'Your data is yours. It is not used to train models. Enterprise plans can pin processing to a region, and tenant runners let the most sensitive execution stay inside your own network.',
          'Every state-changing action is logged with actor, timestamp, before, and after — which means your own audit obligations are served by the same records we keep.',
          'This page is a summary in a rebuild of the site. The operative policy is the one published at apragya.ai/legal/privacy.',
        ],
      },
    ],
  },
  {
    slug: 'legal/terms',
    eyebrow: 'Legal',
    title: 'Terms of Service',
    blurb: 'The agreement covering use of the platform, plans, and acceptable use.',
    sections: [
      {
        kind: 'prose',
        eyebrow: 'Summary',
        title: 'The short version.',
        paragraphs: [
          'Plans are billed monthly or annually, cancellable at any time, and your data exports cleanly if you leave.',
          'You are responsible for what your users and agents do with the platform; we are responsible for the platform behaving as documented and for the governance controls doing what they say.',
          'This page is a summary in a rebuild of the site. The operative terms are the ones published at apragya.ai/legal/terms.',
        ],
      },
    ],
  },
  {
    slug: 'legal/cookies',
    eyebrow: 'Legal',
    title: 'Cookie Policy',
    blurb: 'What we store in your browser and why.',
    sections: [
      {
        kind: 'prose',
        eyebrow: 'Summary',
        title: 'The short version.',
        paragraphs: [
          'Essential cookies keep you signed in and hold your session. Everything else is optional and declined by default unless you accept it.',
          'This rebuild stores only your theme choice and a local demo session — nothing is sent anywhere.',
        ],
      },
    ],
  },
]
