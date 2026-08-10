import type { CSSProperties, ReactNode } from "react";

export type DataListColumnAlign = "start" | "center" | "end";

export type DataListColumn<TItem> = {
  key: string;
  header: ReactNode;
  render: (item: TItem) => ReactNode;
  align?: DataListColumnAlign;
  width?: CSSProperties["width"];
  minWidth?: CSSProperties["minWidth"];
};

export type DataListProps<TItem> = {
  items: TItem[];
  columns: Array<DataListColumn<TItem>>;
  getRowKey: (item: TItem) => string;
  ariaLabel?: string;
};

export function DataList<TItem>({ items, columns, getRowKey, ariaLabel }: DataListProps<TItem>) {
  return (
    <div className="yuni-data-list">
      <table aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-align={column.align ?? "start"}
                style={{ width: column.width, minWidth: column.minWidth }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key} data-align={column.align ?? "start"}>
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
