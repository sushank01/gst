import { notFound } from 'next/navigation'
import { ProductPage } from '../../screens/ProductPage'
import { allPages } from '../../lib/pages'

export function generateStaticParams() {
  return allPages.map((page) => ({ slug: page.slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = allPages.find((item) => item.slug === slug)
  if (!page) notFound()
  return <ProductPage page={page} />
}
