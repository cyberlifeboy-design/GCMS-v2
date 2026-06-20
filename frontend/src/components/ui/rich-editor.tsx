import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { cn } from '@/lib/utils';

interface RichEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    dir?: 'ltr' | 'rtl';
    className?: string;
    minHeight?: number;
}

const ToolbarButton = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            active ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
        )}
    >
        {children}
    </button>
);

export function RichEditor({ value, onChange, placeholder, dir = 'ltr', className, minHeight = 180 }: RichEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content: value || '',
        onUpdate({ editor }) {
            const html = editor.getHTML();
            onChange(html === '<p></p>' ? '' : html);
        },
        editorProps: {
            attributes: {
                class: 'outline-none p-3 text-sm leading-relaxed',
                dir,
                ...(placeholder ? { 'data-placeholder': placeholder } : {}),
            },
        },
    });

    if (!editor) return null;

    return (
        <div className={cn('border rounded-xl overflow-hidden bg-background', className)}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
                <ToolbarButton title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
                    <strong>B</strong>
                </ToolbarButton>
                <ToolbarButton title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
                    <em>I</em>
                </ToolbarButton>
                <ToolbarButton title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
                    <u>U</u>
                </ToolbarButton>
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarButton title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
                    H2
                </ToolbarButton>
                <ToolbarButton title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
                    H3
                </ToolbarButton>
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
                    • List
                </ToolbarButton>
                <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
                    1. List
                </ToolbarButton>
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarButton title="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}>
                    ←
                </ToolbarButton>
                <ToolbarButton title="Align center" onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}>
                    ↔
                </ToolbarButton>
                <ToolbarButton title="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}>
                    →
                </ToolbarButton>
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
                    ✕ Clear
                </ToolbarButton>
            </div>

            {/* Editor area */}
            <div style={{ minHeight }} className="relative">
                {editor.isEmpty && placeholder && (
                    <p className="absolute top-3 left-3 text-sm text-muted-foreground/50 pointer-events-none select-none" dir={dir}>
                        {placeholder}
                    </p>
                )}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

// Read-only renderer — renders stored HTML safely on the form
export function RichContent({ html, className, dir }: { html: string; className?: string; dir?: 'ltr' | 'rtl' }) {
    if (!html) return null;
    return (
        <div
            className={cn('rich-content text-xs leading-relaxed', className)}
            dir={dir}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
