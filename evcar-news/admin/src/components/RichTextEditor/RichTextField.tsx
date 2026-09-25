import { Input } from '@mantine/core';
import { RichTextEditor, type RichTextEditorLabels } from '@mantine/tiptap';
import { IconBrandYoutube, IconPhoto } from '@tabler/icons-react';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import Youtube from '@tiptap/extension-youtube';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAllowedLink } from './embeds';
import { InsertMediaModal, type MediaKind } from './InsertMediaModal';

export interface RichTextFieldProps {
  label: string;
  /** HTML; empty document = ''. The backend sanitizes on save. */
  value: string;
  onChange: (html: string) => void;
  /** Content language: sets direction of the editing area (independent of UI language). */
  lang: 'ar' | 'en';
  error?: string | null | undefined;
  required?: boolean;
  disabled?: boolean;
  minHeight?: number;
}

/**
 * Rich text editor for articles / encyclopedia: headings, lists, quotes,
 * https links, tables, https images (with alt text) and allow-listed video
 * embeds (YouTube, rendered via youtube-nocookie).
 */
export function RichTextField({
  label,
  value,
  onChange,
  lang,
  error,
  required,
  disabled = false,
  minHeight = 240,
}: RichTextFieldProps) {
  const { t } = useTranslation('common');
  const [media, setMedia] = useState<MediaKind | null>(null);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
          isAllowedUri: (url) => isAllowedLink(url),
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ allowBase64: false, inline: false }),
      Youtube.configure({
        nocookie: true,
        controls: true,
        allowFullscreen: true,
        modestBranding: true,
      }),
    ],
    content: value,
    editorProps: { attributes: { dir, lang, 'aria-label': label } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // Keep the document in sync when the value is replaced from outside (form reset).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (value !== current) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const labels = useMemo<Partial<RichTextEditorLabels>>(
    () => ({
      boldControlLabel: t('editor.bold'),
      italicControlLabel: t('editor.italic'),
      underlineControlLabel: t('editor.underline'),
      strikeControlLabel: t('editor.strike'),
      clearFormattingControlLabel: t('editor.clearFormatting'),
      bulletListControlLabel: t('editor.bulletList'),
      orderedListControlLabel: t('editor.orderedList'),
      blockquoteControlLabel: t('editor.blockquote'),
      hrControlLabel: t('editor.hr'),
      linkControlLabel: t('editor.link'),
      unlinkControlLabel: t('editor.unlink'),
      linkEditorInputLabel: t('editor.url'),
      linkEditorInputPlaceholder: 'https://',
      linkEditorSave: t('actions.save'),
      linkEditorExternalLink: t('editor.linkNewTab'),
      linkEditorInternalLink: t('editor.linkSameTab'),
      undoControlLabel: t('editor.undo'),
      redoControlLabel: t('editor.redo'),
      tableInsertControlLabel: t('editor.tableInsert'),
      tableInsertLabel: (columns: number, rows: number) => t('editor.tableSize', { columns, rows }),
      tableDeleteControlLabel: t('editor.tableDelete'),
      tableRowAfterControlLabel: t('editor.tableRowAfter'),
      tableRowDeleteControlLabel: t('editor.tableRowDelete'),
      tableColumnAfterControlLabel: t('editor.tableColumnAfter'),
      tableColumnDeleteControlLabel: t('editor.tableColumnDelete'),
      tableToggleHeaderRowControlLabel: t('editor.tableHeaderRow'),
    }),
    [t],
  );

  const inTable = editor?.isActive('table') ?? false;

  return (
    <Input.Wrapper label={label} required={required} error={error}>
      <RichTextEditor editor={editor} labels={labels} mt={4}>
        <RichTextEditor.Toolbar sticky stickyOffset={60}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.ClearFormatting />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
            <RichTextEditor.H4 />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
            <RichTextEditor.Blockquote />
            <RichTextEditor.Hr />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Control
              onClick={() => setMedia('image')}
              aria-label={t('editor.insertImage')}
              title={t('editor.insertImage')}
              disabled={disabled}
            >
              <IconPhoto size={16} stroke={1.5} aria-hidden />
            </RichTextEditor.Control>
            <RichTextEditor.Control
              onClick={() => setMedia('video')}
              aria-label={t('editor.insertVideo')}
              title={t('editor.insertVideo')}
              disabled={disabled}
            >
              <IconBrandYoutube size={16} stroke={1.5} aria-hidden />
            </RichTextEditor.Control>
            <RichTextEditor.TableInsert />
          </RichTextEditor.ControlsGroup>
          {inTable ? (
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.TableRowAfter />
              <RichTextEditor.TableRowDelete />
              <RichTextEditor.TableColumnAfter />
              <RichTextEditor.TableColumnDelete />
              <RichTextEditor.TableToggleHeaderRow />
              <RichTextEditor.TableDelete />
            </RichTextEditor.ControlsGroup>
          ) : null}
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>
        <RichTextEditor.Content dir={dir} lang={lang} mih={minHeight} />
      </RichTextEditor>
      <InsertMediaModal
        kind={media}
        onClose={() => setMedia(null)}
        onInsert={({ url, alt }) => {
          if (!editor) return;
          const chain = editor.chain().focus();
          if (media === 'video') chain.setYoutubeVideo({ src: url }).run();
          else chain.setImage({ src: url, alt: alt ?? '' }).run();
        }}
      />
    </Input.Wrapper>
  );
}
