import { useNavigate, useParams } from 'react-router-dom';
import { DocumentationPageContent, type DocsTopPage } from '@/components/VisualNavigationDocsDialog';

const DOC_PAGES: DocsTopPage[] = ['guides', 'reference', 'samples', 'license', 'changelog'];

const Documentation = () => {
  const navigate = useNavigate();
  const { page } = useParams<{ page?: string }>();
  const topPage: DocsTopPage = DOC_PAGES.includes((page ?? 'guides') as DocsTopPage)
    ? ((page ?? 'guides') as DocsTopPage)
    : 'guides';

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <DocumentationPageContent
      topPage={topPage}
      onTopPageChange={(nextPage) => navigate(nextPage === 'guides' ? '/docs' : `/docs/${nextPage}`)}
      onBack={handleBack}
      onClose={() => navigate('/')}
    />
  );
};

export default Documentation;
