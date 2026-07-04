import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface NonCustodialCardProps {
  title: string;
  body: string;
}

/** Reassurance card (shield + copy) shared by Confirm and Account. */
export function NonCustodialCard({ title, body }: NonCustodialCardProps) {
  return (
    <View
      className="flex-row gap-3 rounded-2xl border p-4"
      style={{
        backgroundColor: 'rgba(212,197,163,.07)',
        borderColor: 'rgba(212,197,163,.22)',
      }}
    >
      <Svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <Path
          d="M12 2.5l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V5.5z"
          fill="none"
          stroke="#d4c5a3"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M9 12l2 2 4-4"
          fill="none"
          stroke="#d4c5a3"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <View className="flex-1">
        <Text className="font-sans-semibold text-[13.5px] text-ink">
          {title}
        </Text>
        <Text
          className="mt-1 font-sans text-[11.5px] leading-[19px]"
          style={{ color: '#9a958a' }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
