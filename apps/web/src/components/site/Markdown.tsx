import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders CMS markdown. Raw HTML is NOT enabled (no rehype-raw), so content cannot inject markup. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-rr">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children: c }) => (
            <div className="overflow-x-auto">
              <table>{c}</table>
            </div>
          ),
          a: ({ href, children: c }) => {
            const external = !!href && /^https?:\/\//.test(href);
            return (
              <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {c}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
