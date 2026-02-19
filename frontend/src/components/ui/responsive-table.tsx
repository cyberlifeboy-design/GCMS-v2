import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

interface Column<T> {
    key: keyof T | string;
    header: string;
    render?: (item: T) => React.ReactNode;
    mobileLabel?: string;
}

interface ResponsiveTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (item: T) => string;
    emptyMessage?: string;
    loading?: boolean;
}

export function ResponsiveTable<T>({
    data,
    columns,
    keyExtractor,
    emptyMessage = 'No data available',
    loading = false
}: ResponsiveTableProps<T>) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    // Mobile card view
    if (isMobile) {
        return (
            <div className="space-y-3">
                {data.map((item) => (
                    <Card key={keyExtractor(item)}>
                        <CardContent className="p-4">
                            <div className="space-y-2">
                                {columns.map((column) => (
                                    <div key={String(column.key)} className="flex justify-between items-start gap-2">
                                        <span className="text-sm font-medium text-muted-foreground min-w-[100px]">
                                            {column.mobileLabel || column.header}
                                        </span>
                                        <span className="text-sm text-right flex-1">
                                            {column.render
                                                ? column.render(item)
                                                : String((item as any)[column.key] ?? '-')
                                            }
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    // Desktop table view
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((column) => (
                            <TableHead key={String(column.key)}>{column.header}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((item) => (
                        <TableRow key={keyExtractor(item)}>
                            {columns.map((column) => (
                                <TableCell key={String(column.key)}>
                                    {column.render
                                        ? column.render(item)
                                        : String((item as any)[column.key] ?? '-')
                                    }
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}