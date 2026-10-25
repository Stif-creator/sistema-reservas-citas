import { useEffect } from 'react'

export default function usePageMetadata(title, description) {
  useEffect(() => {
    const previousTitle = document.title
    const descriptionTag = document.querySelector('meta[name="description"]')
    const previousDescription = descriptionTag?.content
    document.title = title
    if (descriptionTag) descriptionTag.content = description
    return () => {
      document.title = previousTitle
      if (descriptionTag && previousDescription !== undefined) descriptionTag.content = previousDescription
    }
  }, [title, description])
}
