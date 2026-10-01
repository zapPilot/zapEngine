import { createHash } from 'node:crypto';
import path from 'node:path';

export function violationKey(rule, source) {
  return `${rule}:${createHash('sha256').update(source.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 20)}`;
}

/** Counts exact source fingerprints per file; old debt cannot authorize a new value elsewhere. */
export function ratchet(ruleName, rule, baseline, root) {
  return {
    ...rule,
    create(context) {
      const file = path
        .relative(root, context.filename)
        .split(path.sep)
        .join('/');
      const remaining = { ...baseline[file] };
      const wrapped = Object.create(context);
      Object.defineProperty(wrapped, 'report', {
        value(descriptor) {
          const key = violationKey(
            ruleName,
            context.sourceCode.getText(descriptor.node),
          );
          if (
            process.env.ZAP_UI_RECORD_BASELINE !== '1' &&
            remaining[key] > 0
          ) {
            remaining[key] -= 1;
            return;
          }
          context.report(descriptor);
        },
      });
      return rule.create(wrapped);
    },
  };
}

const rawValues = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      raw: 'Use a design token instead of a raw color, size, radius, weight, or native CSS animation.',
    },
  },
  create(context) {
    function inspect(node, value) {
      if (typeof value !== 'string') return;
      const color = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i;
      const arbitrary =
        /(?:^|[\s'"`])(?:[\w-]+:)*(?:text|rounded|bg|border|ring|fill|stroke)-\[[^\]]+\]/;
      const defaults =
        /(?:^|\s)(?:[\w-]+:)*(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|rounded(?:-(?:none|sm|md|lg|xl|[2-9]xl|full))?|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black))(?=\s|$)/;
      const nativeMotion = value
        .split(/\s+/)
        .some(
          (token) =>
            /(?:^|:)(?:transition|animate)(?:-|$)/.test(token) &&
            !token.split(':').includes('web'),
        );
      if (
        color.test(value) ||
        arbitrary.test(value) ||
        defaults.test(value) ||
        (nativeMotion && !/\.web\.[jt]sx?$/.test(context.filename))
      )
        context.report({ node, messageId: 'raw' });
    }
    return {
      Property(node) {
        const name = node.key.name ?? node.key.value;
        if (
          /^(?:fontSize|lineHeight|fontWeight|border(?:TopLeft|TopRight|BottomLeft|BottomRight)?Radius)$/.test(
            name,
          ) &&
          node.value.type === 'Literal'
        ) {
          context.report({ node: node.value, messageId: 'raw' });
        }
      },
      Literal(node) {
        inspect(node, node.value);
      },
      TemplateElement(node) {
        inspect(node, node.value.raw);
      },
    };
  },
};
const rawText = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      raw: 'Use the UI Text or TextField primitive instead of React Native Text/TextInput.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          node.source.value !== 'react-native' ||
          /\/components\/ui\//.test(context.filename)
        )
          return;
        for (const specifier of node.specifiers)
          if (['Text', 'TextInput'].includes(specifier.imported?.name))
            context.report({ node: specifier, messageId: 'raw' });
      },
    };
  },
};
const directIcon = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      raw: 'Render icons through the UI Icon or IconButton primitive.',
    },
  },
  create(context) {
    const icons = new Set();
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'lucide-react-native')
          for (const specifier of node.specifiers)
            icons.add(specifier.local.name);
      },
      JSXOpeningElement(node) {
        if (/\/components\/ui\//.test(context.filename)) return;
        if (
          icons.has(node.name.name) ||
          (node.name.type === 'JSXMemberExpression' &&
            icons.has(node.name.object.name))
        )
          context.report({ node, messageId: 'raw' });
      },
    };
  },
};
export const designSystemRules = {
  'no-raw-design-values': rawValues,
  'no-raw-text': rawText,
  'no-direct-icon': directIcon,
};
