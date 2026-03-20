import { useLocation, useNavigate, useSearchParams as useReactRouterSearchParams } from 'react-router-dom';

type NavigateOptions = {
  scroll?: boolean;
};

export function useRouter() {
  const navigate = useNavigate();

  return {
    push(href: string, _options?: NavigateOptions) {
      navigate(href);
    },
    replace(href: string, _options?: NavigateOptions) {
      navigate(href, { replace: true });
    },
    back() {
      navigate(-1);
    },
    refresh() {
      window.location.reload();
    },
    prefetch(_href: string) {
      return Promise.resolve();
    },
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  const [searchParams] = useReactRouterSearchParams();
  return searchParams;
}

export function redirect(href: string) {
  if (typeof window === 'undefined') {
    throw new Error(`redirect(${href}) cannot run during desktop static evaluation.`);
  }
  window.location.replace(href);
}
