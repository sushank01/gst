/**
 * The Business Suite catalogue behind the sidebar's AI Tools group.
 *
 * Writing, Creative and Development are transcribed tool-for-tool from the live
 * `/business?category=…` pages — same names, same blurbs, same credit costs. The
 * remaining categories are patterned on them to reach the "100+ tools" the suite
 * home advertises; their counts and copy are this rebuild's own.
 */

export type SuiteTool = {
  name: string
  blurb: string
  /** AI Credits a single run costs, shown on the card as `~N AI Credits`. */
  cost: number
}

export type SuiteCategory = {
  id: string
  name: string
  icon: string
  tools: SuiteTool[]
}

const tool = (name: string, cost: number, blurb: string): SuiteTool => ({ name, cost, blurb })

export const suiteCategories: SuiteCategory[] = [
  {
    id: 'writing',
    name: 'Writing',
    icon: 'pen',
    tools: [
      tool('Blog Post Generator', 3, 'Generate engaging, SEO-optimized blog posts on any topic'),
      tool('Article Writer', 3, 'Write in-depth articles with research-style formatting'),
      tool('Essay Writer', 3, 'Write structured essays for academic or professional use'),
      tool('Creative Story Writer', 3, 'Generate creative fiction stories in any genre'),
      tool('Email Writer', 1, 'Compose professional emails for any business scenario'),
      tool('Cover Letter Generator', 2, 'Create compelling cover letters tailored to job applications'),
      tool('Resume/CV Builder', 2, 'Generate professional resumes and CVs'),
      tool('Product Description Writer', 1, 'Write compelling product descriptions that convert'),
      tool('Press Release Writer', 2, 'Write professional press releases for media distribution'),
      tool('Newsletter Writer', 2, 'Create engaging email newsletters that drive engagement'),
      tool('Script Writer', 2, 'Write scripts for videos, podcasts, and presentations'),
      tool('Poem Generator', 1, 'Create beautiful poems in various styles and forms'),
    ],
  },
  {
    id: 'social',
    name: 'Social media',
    icon: 'link',
    tools: [
      tool('Social Media Post Generator', 1, 'Write posts tuned to each network’s format'),
      tool('Instagram Caption Writer', 1, 'Write captions that fit the image and the audience'),
      tool('LinkedIn Post Writer', 1, 'Write professional posts that read like a person wrote them'),
      tool('Thread Writer', 1, 'Turn one idea into a numbered thread that holds attention'),
      tool('Hashtag Generator', 0, 'Suggest hashtags by reach, relevance and competition'),
      tool('YouTube Title & Description', 1, 'Write titles and descriptions that survive search'),
      tool('Short Video Script Writer', 1, 'Write hook-first scripts for short-form video'),
      tool('Social Ad Copy', 1, 'Write paid social copy in the platform’s character limits'),
      tool('Content Calendar Planner', 2, 'Plan a month of posts around your themes'),
      tool('Community Reply Writer', 1, 'Draft on-brand replies to comments and mentions'),
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: 'megaphone',
    tools: [
      tool('Ad Copy Generator', 2, 'Write ad copy for search, display and paid social'),
      tool('Landing Page Copywriter', 3, 'Write a full landing page from offer to CTA'),
      tool('SEO Keyword Researcher', 2, 'Cluster keywords by intent and difficulty'),
      tool('Meta Description Writer', 1, 'Write meta titles and descriptions that earn the click'),
      tool('Email Campaign Writer', 2, 'Write a sequence, not just a single send'),
      tool('Cold Outreach Writer', 1, 'Write outreach that references something real'),
      tool('Value Proposition Builder', 2, 'Turn features into the outcome a buyer pays for'),
      tool('Brand Voice Guide', 3, 'Codify tone, vocabulary and the things you never say'),
      tool('Case Study Writer', 3, 'Write a customer story with the numbers up front'),
      tool('Customer Persona Builder', 2, 'Build personas from real segments, not archetypes'),
      tool('A/B Variant Writer', 2, 'Generate copy variants that differ on one axis'),
      tool('Campaign Brief Generator', 2, 'Write the brief an agency could actually work from'),
    ],
  },
  {
    id: 'business',
    name: 'Business',
    icon: 'briefcase',
    tools: [
      tool('Business Plan Generator', 4, 'Generate comprehensive business plans for startups and companies'),
      tool('Executive Summary Writer', 2, 'Compress a long document into the page an exec reads'),
      tool('SWOT Analysis Generator', 2, 'Build a SWOT that names specifics, not categories'),
      tool('Meeting Minutes Summarizer', 1, 'Turn a transcript into decisions, owners and dates'),
      tool('Project Proposal Writer', 3, 'Write scope, timeline and commercials in one document'),
      tool('Job Description Writer', 1, 'Write role descriptions that screen in the right people'),
      tool('Interview Question Generator', 1, 'Generate questions that probe the actual competency'),
      tool('Performance Review Writer', 2, 'Write reviews grounded in evidence, not adjectives'),
      tool('Policy Document Writer', 3, 'Draft internal policies in plain, enforceable language'),
      tool('Invoice Description Writer', 0, 'Write line items a client can approve without asking'),
      tool('Pitch Deck Outliner', 3, 'Outline a deck slide by slide with the narrative intact'),
      tool('Contract Clause Explainer', 2, 'Explain a clause in plain English and flag what it costs'),
    ],
  },
  {
    id: 'creative',
    name: 'Creative',
    icon: 'palette',
    tools: [
      tool('AI Image Prompt Generator', 1, 'Generate detailed prompts for AI image generation tools'),
      tool('Song Lyrics Writer', 1, 'Write original song lyrics in any genre'),
      tool('Book Outline Generator', 3, 'Create detailed book outlines for fiction and non-fiction'),
      tool('Character Creator', 1, 'Create detailed fictional characters for stories and games'),
      tool('Worldbuilding Assistant', 2, 'Build detailed fictional worlds for stories and games'),
      tool('Dialogue Writer', 2, 'Write natural, compelling dialogue for stories and scripts'),
      tool('Name Generator', 1, 'Generate names for characters, places, and fictional elements'),
      tool('Writing Prompt Generator', 1, 'Generate creative writing prompts to spark imagination'),
    ],
  },
  {
    id: 'development',
    name: 'Development',
    icon: 'code',
    tools: [
      tool('Code Generator', 2, 'Generate code in any programming language'),
      tool('Code Reviewer', 2, 'Review code for bugs, performance, and best practices'),
      tool('Code Explainer', 1, 'Explain code in plain English with line-by-line breakdown'),
      tool('Code Converter', 2, 'Convert code between programming languages'),
      tool('API Documentation Generator', 2, 'Generate comprehensive API documentation'),
      tool('Regex Generator', 1, 'Generate and explain regular expressions'),
      tool('SQL Query Generator', 1, 'Generate SQL queries from natural language descriptions'),
      tool('Unit Test Generator', 2, 'Generate unit tests for any code'),
      tool('Git Commit Message Writer', 0, 'Generate clear, conventional commit messages'),
      tool('Dockerfile Generator', 1, 'Generate optimized Dockerfiles and docker-compose configs'),
      tool('README Generator', 1, 'Generate professional README files for projects'),
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    icon: 'zap',
    tools: [
      tool('AI Chat Assistant', 1, 'General-purpose AI chat for any question or task'),
      tool('AI Agent Prompt Engineer', 2, 'Design system prompts for AI agents and chatbots'),
      tool('Text Summarizer', 1, 'Summarize anything down to the part that matters'),
      tool('Document Q&A', 2, 'Ask questions against a document and get cited answers'),
      tool('Translator', 1, 'Translate while keeping register and domain terms'),
      tool('Grammar & Style Fixer', 1, 'Fix grammar without flattening the voice'),
      tool('Tone Rewriter', 1, 'Rewrite the same content for a different reader'),
      tool('Text Simplifier', 1, 'Rewrite dense text at the reading level you choose'),
      tool('Agenda Builder', 1, 'Turn a goal into an agenda with times against it'),
      tool('Task Breakdown', 0, 'Break a piece of work into tasks someone can pick up'),
      tool('Checklist Generator', 0, 'Generate a checklist for a process you repeat'),
    ],
  },
  {
    id: 'data',
    name: 'Data & Analysis',
    icon: 'chart',
    tools: [
      tool('Data Analyzer', 3, 'Describe what a dataset actually says, with caveats'),
      tool('Spreadsheet Formula Writer', 1, 'Write and explain formulas from a description'),
      tool('Chart Recommender', 1, 'Pick the chart that answers the question being asked'),
      tool('Report Writer', 3, 'Turn numbers into a report with a conclusion'),
      tool('KPI Definition Builder', 2, 'Define metrics precisely enough to argue about'),
      tool('Survey Question Generator', 1, 'Write survey questions that do not lead the answer'),
      tool('Dataset Describer', 2, 'Document columns, types and the gotchas in the data'),
      tool('Forecast Narrative Writer', 2, 'Explain a forecast and what would break it'),
      tool('Pivot Table Planner', 1, 'Plan the pivot before you build it'),
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: 'graduation',
    tools: [
      tool('Lesson Plan Generator', 2, 'Build a lesson plan with objectives and timings'),
      tool('Quiz Generator', 1, 'Generate questions with answers and distractors'),
      tool('Flashcard Generator', 1, 'Turn material into cards worth repeating'),
      tool('Study Guide Writer', 2, 'Condense a syllabus into a guide you can revise from'),
      tool('Concept Explainer', 1, 'Explain a concept at the level you ask for'),
      tool('Math Problem Solver', 1, 'Work through a problem step by step'),
      tool('Research Assistant', 3, 'Summarize sources and say where they disagree'),
      tool('Citation Formatter', 0, 'Format references in the style you need'),
      tool('Curriculum Outliner', 2, 'Sequence a course from first session to last'),
    ],
  },
  {
    id: 'image',
    name: 'Image',
    icon: 'image',
    tools: [
      tool('Image Generator', 2, 'Generate AI images from a description'),
      tool('Logo Concept Generator', 2, 'Generate logo directions before you commission one'),
      tool('Product Shot Prompt', 1, 'Write prompts for product photography that looks real'),
      tool('Illustration Prompt Builder', 1, 'Build prompts with style, medium and composition'),
      tool('Thumbnail Concept Generator', 1, 'Generate thumbnail concepts that read at small sizes'),
      tool('Icon Set Prompt Builder', 1, 'Generate a consistent icon set brief'),
      tool('Image Caption Writer', 1, 'Write captions that add context, not description'),
      tool('Alt Text Generator', 0, 'Write alt text that a screen reader user can use'),
    ],
  },
]

export const totalSuiteTools = suiteCategories.reduce((sum, category) => sum + category.tools.length, 0)

export const categoryById = Object.fromEntries(suiteCategories.map((category) => [category.id, category]))

export function toolSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export type LocatedTool = SuiteTool & { category: SuiteCategory }

/** Every tool, flattened, so search and the `/tool/:slug` route can find one by slug. */
export const allSuiteTools: LocatedTool[] = suiteCategories.flatMap((category) =>
  category.tools.map((item) => ({ ...item, category })),
)

export const toolBySlug = Object.fromEntries(allSuiteTools.map((item) => [toolSlug(item.name), item]))

/** The three cards under "Quick access" on the suite home. */
export const quickAccess = [
  { icon: 'message', name: 'AI chat', blurb: 'Chat with AI models', to: '/app/business/chat' },
  { icon: 'image', name: 'Image generator', blurb: 'Generate AI images', to: '/app/business/tool/image-generator' },
  { icon: 'terminal', name: 'Code assistant', blurb: 'AI-powered coding help', to: '/app/business/tool/code-generator' },
]

/** "Featured tools", by name — costs and blurbs come from the catalogue itself. */
export const featuredToolNames = [
  'AI Agent Prompt Engineer',
  'AI Chat Assistant',
  'AI Image Prompt Generator',
  'Blog Post Generator',
  'Business Plan Generator',
  'Code Generator',
]

export const featuredTools = featuredToolNames
  .map((name) => allSuiteTools.find((item) => item.name === name))
  .filter((item): item is LocatedTool => Boolean(item))

/** The six starter prompts on an empty AI chat. */
export const chatSuggestions = [
  'Write a professional email to follow up on a client meeting',
  'Explain quantum computing in simple terms',
  'Create a marketing plan for a new SaaS product',
  'Help me debug a React component that has infinite re-renders',
  'Write a business proposal template for consulting services',
  'Summarize the key principles of effective leadership',
]

export const chatModels = ['Claude Sonnet 4.6', 'Claude Opus 4.6', 'GPT-4.1', 'Gemini 2.5 Pro', 'Llama 3.3 70B']
