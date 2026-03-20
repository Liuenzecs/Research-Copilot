import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  children?: ReactNode;
  href: string;
  replace?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { children, href, prefetch: _prefetch, replace, scroll: _scroll, target, ...rest },
  ref,
) {
  if (/^(https?:)?\/\//i.test(href) || target === '_blank') {
    return (
      <a ref={ref} href={href} target={target} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink ref={ref} replace={replace} target={target} to={href} {...rest}>
      {children}
    </RouterLink>
  );
});

export default Link;
