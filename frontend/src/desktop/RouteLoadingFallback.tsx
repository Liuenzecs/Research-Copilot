import Card from '@/components/common/Card';
import Loading from '@/components/common/Loading';

export default function RouteLoadingFallback({ text = '正在加载页面...' }: { text?: string }) {
  return (
    <Card>
      <Loading text={text} />
    </Card>
  );
}
