import { Text, View } from 'react-native';

interface MockBridgeNoticeProps {
  title: string;
  body: string;
}

export function MockBridgeNotice({ title, body }: MockBridgeNoticeProps) {
  return (
    <View className="mt-4 rounded-xl border border-[rgba(234,179,8,.2)] bg-[rgba(234,179,8,.06)] p-3">
      <Text className="font-sans-semibold text-[12px] text-[#d7bd70]">
        {title}
      </Text>
      <Text className="mt-1 text-[11px] leading-[17px] text-[#aa9760]">
        {body}
      </Text>
    </View>
  );
}
