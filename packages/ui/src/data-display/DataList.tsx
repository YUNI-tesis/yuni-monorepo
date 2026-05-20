import type { ReactNode } from "react";

export type DataListColumn<TItem> = {
  key: string;
  header: string;
  render: (item: TItem) => ReactNode;
};

export type DataListProps<TItem> = {
  items: TItem[];
  columns: Array<DataListColumn<TItem>>;
  getRowKey: (item: TItem) => string;
};

export function DataList<TItem>({ items, columns, getRowKey }: DataListProps<TItem>) {
  return (
    <div className="yuni-data-list">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
