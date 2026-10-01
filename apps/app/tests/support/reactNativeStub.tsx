import {
  forwardRef,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';

interface NativeProps {
  children?: ReactNode;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityHint?: string;
  accessibilityState?: {
    selected?: boolean;
    expanded?: boolean;
    disabled?: boolean;
    checked?: boolean;
  };
  accessible?: boolean;
  disabled?: boolean;
  visible?: boolean;
  value?: string;
  placeholder?: string;
  onChangeText?: (value: string) => void;
  onBlur?: () => void;
  onPress?: () => void;
  onLayout?: (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => void;
  style?: unknown;
}

export const nativeTestRuntime = {
  width: 390,
  height: 844,
  reducedMotion: false,
};

function domProps(props: NativeProps) {
  return {
    'aria-label': props.accessibilityLabel,
    'aria-description': props.accessibilityHint,
    'aria-selected': props.accessibilityState?.selected,
    'aria-expanded': props.accessibilityState?.expanded,
    'aria-disabled': props.disabled ?? props.accessibilityState?.disabled,
    'aria-checked': props.accessibilityState?.checked,
    'data-testid': props.testID,
    className: props.className,
    role:
      props.accessibilityRole === 'header'
        ? 'heading'
        : props.accessibilityRole === 'none'
          ? undefined
          : props.accessibilityRole,
  };
}

const View = forwardRef<HTMLDivElement, NativeProps>(function View(props, ref) {
  const { onLayout } = props;
  useLayoutEffect(() => {
    onLayout?.({
      nativeEvent: {
        layout: {
          width: nativeTestRuntime.width,
          height: nativeTestRuntime.height,
        },
      },
    });
  }, [onLayout]);
  return (
    <div ref={ref} {...domProps(props)}>
      {props.children}
    </div>
  );
});
const Text = forwardRef<HTMLSpanElement, NativeProps>(
  function Text(props, ref) {
    return (
      <span ref={ref} {...domProps(props)}>
        {props.children}
      </span>
    );
  },
);
const Pressable = forwardRef<HTMLButtonElement, NativeProps>(
  function Pressable(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...domProps(props)}
        disabled={props.disabled ?? props.accessibilityState?.disabled}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    );
  },
);
const TextInput = forwardRef<HTMLInputElement, NativeProps>(
  function TextInput(props, ref) {
    return (
      <input
        ref={ref}
        {...domProps(props)}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChangeText?.(event.target.value)}
        onBlur={props.onBlur}
      />
    );
  },
);
function Image(props: NativeProps) {
  return (
    <span
      {...domProps(props)}
      role={props.accessible === false ? undefined : 'img'}
    />
  );
}
function Modal(props: NativeProps) {
  return props.visible ? (
    <div {...domProps(props)} role="dialog">
      {props.children}
    </div>
  ) : null;
}
class AnimatedValue {
  constructor(public value: number) {}
  setValue(value: number) {
    this.value = value;
  }
  interpolate() {
    return this.value;
  }
  stopAnimation() {}
}
const animation = () => ({
  start: (done?: (result: { finished: boolean }) => void) =>
    done?.({ finished: true }),
  stop: () => {},
});
const easing = (value: number) => value;

/** DOM stand-ins test interactions and accessibility; they do not prove native animation behavior. */
export const reactNativeStub = {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  TouchableOpacity: Pressable,
  ScrollView: View,
  SafeAreaView: View,
  Modal,
  ActivityIndicator: (props: NativeProps) => (
    <span {...domProps(props)} role="progressbar" />
  ),
  Platform: {
    OS: 'web',
    select: (values: { web?: unknown; default?: unknown }) =>
      values.web ?? values.default,
  },
  useWindowDimensions: () => ({
    width: nativeTestRuntime.width,
    height: nativeTestRuntime.height,
    scale: 1,
    fontScale: 1,
  }),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: (style: CSSProperties) => style,
    absoluteFillObject: {},
  },
  Animated: {
    Value: AnimatedValue,
    View,
    Text,
    timing: animation,
    spring: animation,
    loop: animation,
    sequence: animation,
    parallel: animation,
    createAnimatedComponent: <T,>(component: T) => component,
  },
  Easing: {
    linear: easing,
    ease: easing,
    bezier: () => easing,
    inOut: () => easing,
    quad: easing,
    cubic: easing,
    out: () => easing,
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => nativeTestRuntime.reducedMotion,
    addEventListener: () => ({ remove() {} }),
    announceForAccessibility() {},
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } },
  UIManager: { setLayoutAnimationEnabledExperimental() {} },
  Keyboard: { dismiss() {}, addListener: () => ({ remove() {} }) },
  Dimensions: {
    get: () => ({
      width: nativeTestRuntime.width,
      height: nativeTestRuntime.height,
    }),
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
  },
  Linking: { openURL: async () => {}, canOpenURL: async () => true },
};
