import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { components } from '@/lib/types.gen';
import { Button } from '@/shared/components/ui/button';
import { useCanvasStore, type ResourceNode } from '@/features/canvas/store';
import { isValidName, isValidNumber } from '@/features/canvas/validation';

type ApiAttrValue = components['schemas']['AttrValue'];
type LitType = 'string' | 'number' | 'bool';

function literal(litType: LitType, value: string): ApiAttrValue {
  return { kind: 'literal', litType, value };
}

export function Inspector() {
  const { t } = useTranslation();
  // Select the stable nodes array and derive the selection in the body — a
  // selector that returns a fresh filtered array each call breaks
  // useSyncExternalStore's snapshot caching and loops.
  const nodes = useCanvasStore((s) => s.nodes);
  const selected = nodes.filter((n) => n.selected);

  if (selected.length === 0) {
    return <Empty>{t('inspector.empty')}</Empty>;
  }
  if (selected.length > 1) {
    return <Empty>{t('inspector.multiple', { count: selected.length })}</Empty>;
  }
  // key forces a fresh form (and fresh local input state) per resource, so the
  // name field can never show or commit a previous node's value.
  return <ResourceForm key={selected[0].id} node={selected[0]} nodes={nodes} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ResourceForm({ node, nodes }: { node: ResourceNode; nodes: ResourceNode[] }) {
  const { t } = useTranslation();
  const setNodeName = useCanvasStore((s) => s.setNodeName);
  const setAttribute = useCanvasStore((s) => s.setAttribute);
  const removeAttribute = useCanvasStore((s) => s.removeAttribute);

  const takenNames = nodes
    .filter((n) => n.id !== node.id && n.data.type === node.data.type)
    .map((n) => n.data.name);

  const [name, setName] = useState(node.data.name);
  const nameError = !isValidName(name)
    ? t('inspector.nameInvalid')
    : takenNames.includes(name)
      ? t('inspector.nameTaken')
      : null;

  const commitName = () => {
    if (!nameError && name !== node.data.name) setNodeName(node.id, name);
  };

  // Resolve a reference target to its Terraform address for display.
  const targetLabel = (targetId: string) => {
    const tgt = nodes.find((n) => n.id === targetId);
    return tgt ? `${tgt.data.type}.${tgt.data.name}` : t('inspector.unknownRef');
  };

  const attrKeys = Object.keys(node.data.attributes).sort();

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t(`palette.resource.${node.data.type}`)}
        </div>
        <div className="font-mono text-sm text-muted-foreground">{node.data.type}</div>
      </div>

      <div className="space-y-1 border-b px-4 py-3">
        <label className="text-xs font-medium" htmlFor="resource-name">
          {t('inspector.name')}
        </label>
        <input
          id="resource-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setName(node.data.name);
          }}
          className="w-full rounded-md border bg-background px-2 py-1 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? 'resource-name-error' : undefined}
        />
        {nameError && (
          <p id="resource-name-error" role="alert" className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>

      {node.parentId && (
        <div className="border-b px-4 py-3">
          <div className="text-xs font-medium">{t('inspector.containedIn')}</div>
          <div className="mt-1 font-mono text-xs text-accent">
            {targetLabel(node.parentId)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('inspector.containedHint')}</p>
        </div>
      )}

      <div className="flex-1 px-4 py-3">
        <div className="mb-2 text-xs font-medium">{t('inspector.attributes')}</div>
        {attrKeys.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('inspector.noAttributes')}</p>
        )}
        <div className="space-y-2">
          {attrKeys.map((key) => (
            <AttributeRow
              key={key}
              attrKey={key}
              value={node.data.attributes[key]}
              targetLabel={targetLabel}
              onChange={(v) => setAttribute(node.id, key, v)}
              onRemove={() => removeAttribute(node.id, key)}
            />
          ))}
        </div>
        <AddAttribute
          existingKeys={attrKeys}
          onAdd={(key, value) => setAttribute(node.id, key, value)}
        />
      </div>
    </div>
  );
}

function AttributeRow({
  attrKey,
  value,
  targetLabel,
  onChange,
  onRemove,
}: {
  attrKey: string;
  value: ApiAttrValue;
  targetLabel: (targetId: string) => string;
  onChange: (v: ApiAttrValue) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const editable = value.kind === 'literal';

  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs">{attrKey}</span>
        <button
          onClick={onRemove}
          aria-label={`${t('inspector.remove')}: ${attrKey}`}
          title={t('inspector.remove')}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {editable ? (
        <LiteralValueInput attrKey={attrKey} value={value} onChange={onChange} />
      ) : (
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {value.kind === 'ref'
            ? `→ ${targetLabel(value.target ?? '')}.${value.attribute}`
            : t('inspector.reference')}
        </div>
      )}
    </div>
  );
}

function LiteralValueInput({
  attrKey,
  value,
  onChange,
}: {
  attrKey: string;
  value: ApiAttrValue;
  onChange: (v: ApiAttrValue) => void;
}) {
  const { t } = useTranslation();
  const litType = (value.litType ?? 'string') as LitType;
  // Hooks must run unconditionally, before the bool early-return.
  const raw = value.value ?? '';
  const [draft, setDraft] = useState(raw);

  if (litType === 'bool') {
    const checked = value.value === 'true';
    return (
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(literal('bool', e.target.checked ? 'true' : 'false'))}
          aria-label={`${attrKey} ${t('inspector.value')}`}
        />
        {checked ? 'true' : 'false'}
      </label>
    );
  }

  // string/number share a local draft so typing never writes an invalid value.
  // Strings are always valid and commit live; numbers commit only on blur/Enter
  // when valid, and revert otherwise — so a half-typed "1e" never reaches the
  // store (and never 422s the whole export).
  const invalid = litType === 'number' && draft !== '' && !isValidNumber(draft);

  const commit = () => {
    if (litType === 'number') {
      if (isValidNumber(draft)) onChange(literal('number', draft));
      else setDraft(raw);
    }
  };

  return (
    <input
      value={draft}
      inputMode={litType === 'number' ? 'decimal' : 'text'}
      aria-label={`${attrKey} ${t('inspector.value')}`}
      aria-invalid={invalid}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (litType === 'string') onChange(literal('string', v));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(raw);
      }}
      className="mt-1 w-full rounded border bg-background px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
    />
  );
}

function AddAttribute({
  existingKeys,
  onAdd,
}: {
  existingKeys: string[];
  onAdd: (key: string, value: ApiAttrValue) => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [type, setType] = useState<LitType>('string');
  const [value, setValue] = useState('');

  const keyValid = isValidName(key) && !existingKeys.includes(key);
  // A number must be a complete valid number; strings (incl. empty) are fine.
  const valueValid = type === 'string' || type === 'bool' || isValidNumber(value);
  const canAdd = keyValid && valueValid;

  const add = () => {
    if (!canAdd) return;
    const v: ApiAttrValue = type === 'bool' ? literal('bool', 'false') : literal(type, value);
    onAdd(key, v);
    setKey('');
    setValue('');
    setType('string');
  };

  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-dashed px-2 py-2">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={t('inspector.key')}
        aria-label={t('inspector.key')}
        className="w-full rounded border bg-background px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-invalid={key !== '' && !keyValid}
      />
      <div className="flex gap-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LitType)}
          aria-label={t('inspector.type')}
          className="rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="bool">bool</option>
        </select>
        {type !== 'bool' && (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('inspector.value')}
            aria-label={t('inspector.value')}
            aria-invalid={type === 'number' && value !== '' && !isValidNumber(value)}
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <Button size="sm" variant="outline" onClick={add} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" />
          {t('inspector.add')}
        </Button>
      </div>
    </div>
  );
}
