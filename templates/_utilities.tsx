interface ShowProps<T> {
    when: T | undefined | null | false;
    fallback?: string | number;
    children: string | number | ((item: NonNullable<T>) => string | number);
}

export function Show<T>({ when, fallback = '', children }: ShowProps<T>): string {
    if (!when)
        return String(fallback);


    if (typeof children === 'function')
        return String(children(when as NonNullable<T>));


    return String(children);
}

export interface SetBaseProps {
    name: string;
    operator?: string;
    quoted?: boolean;
    lineTerminator?: string;
}

export type SetComponent = {
    <V>(props: SetBaseProps & { value: V | undefined | null }): string;
    <W>(props: SetBaseProps & { when: W | undefined | null | false }): string;
    <W, V>(props: SetBaseProps & { when: W | undefined | null | false; value: V }): string;
    <W, R>(props: SetBaseProps & { when: W | undefined | null | false; value: (v: NonNullable<W>) => R }): string;
};

function renderSet<V, W>(props: SetBaseProps & { value?: V | undefined | null; when?: W | undefined | null | false }, lineTerminator = "\n", defaultOperator = " = "): string {
    const { name, when, value, quoted = false } = props;
    const operator = props.operator ?? defaultOperator;

    let finalValue: V;

    if ('when' in props) {
        if (!when) return '';
        finalValue = typeof value === 'function' ? value(when) : ('value' in props ? value : when);
    } else if ('value' in props) {
        if (value === undefined || value === null) return '';
        finalValue = value;
    } else {
        return '';
    }

    const formattedValue = (typeof finalValue === 'string' && quoted) ? `"${escapeQuotes(finalValue)}"` : String(finalValue);
    return `${name}${operator}${formattedValue}${lineTerminator}`;
}

export const Set: SetComponent = <V, W>(props: SetBaseProps & { value?: V | undefined | null; when?: W | undefined | null | false }) => renderSet(props, "\n", " = ");

export function createSet(defaultOperator: string, lineTerminator = "\n", defaultQuoted = false): SetComponent {
    return <V, W>(props: SetBaseProps & { value?: V | undefined | null; when?: W | undefined | null | false }) => renderSet({ quoted: defaultQuoted, ...props }, lineTerminator, defaultOperator);
}



interface ForProps<T> {
    each: T[];
    children: (item: T, index: number) => string | number;
}

export function For<T>({ each, children }: ForProps<T>): string {
    return each.map((item, index) => children(item, index)).join('\n');
}

export function escapeQuotes(value: string): string {
    return `${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}`
}