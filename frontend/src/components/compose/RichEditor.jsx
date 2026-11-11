'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  BoldIcon,
  BulletListIcon,
  IndentIcon,
  ItalicIcon,
  OrderedListIcon,
  OutdentIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  TextSizeIcon,
  UnderlineIcon,
  UndoIcon,
  UpDownIcon,
} from '../icons';

/**
 * Rich-text editor: grey card, pill toolbar, contentEditable body.
 * Output is HTML; the backend sanitises it with a strict tag allowlist before saving.
 */
export const RichEditor = forwardRef(function RichEditor({ onChange }, ref) {
  const area = useRef(null);
  useImperativeHandle(ref, () => ({
    getHtml: () => area.current?.innerHTML ?? '',
    clear: () => {
      if (area.current) area.current.innerHTML = '';
    },
  }));

  const exec = (cmd, arg) => {
    area.current?.focus();
    // execCommand is deprecated but still the simplest dependency-free way to drive contentEditable
    document.execCommand(cmd, false, arg);
    onChange?.();
  };
  const isBlock = (tag) => document.queryCommandValue('formatBlock').toLowerCase() === tag;

  const Btn = ({ label, onClick, children }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }} // keep the text selection
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    >
      {children}
    </button>
  );
  const Sep = () => <span className="mx-1 h-4 w-px bg-gray-200" />;

  return (
    <div className="rounded-xl bg-[#F8F8F8] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-1 shadow-sm">
        <Btn label="Undo" onClick={() => exec('undo')}>
          <UndoIcon size={15} />
        </Btn>
        <Btn label="Redo" onClick={() => exec('redo')}>
          <RedoIcon size={15} />
        </Btn>
        <Sep />
        <Btn label="Heading" onClick={() => exec('formatBlock', isBlock('h2') ? 'div' : 'h2')}>
          <TextSizeIcon size={15} />
        </Btn>
        <Sep />
        <Btn label="Bold" onClick={() => exec('bold')}>
          <BoldIcon size={14} />
        </Btn>
        <Btn label="Italic" onClick={() => exec('italic')}>
          <ItalicIcon size={14} />
        </Btn>
        <Btn label="Underline" onClick={() => exec('underline')}>
          <UnderlineIcon size={14} />
        </Btn>
        <Sep />
        <Btn label="Center" onClick={() => exec('justifyCenter')}>
          <AlignCenterIcon size={15} />
        </Btn>
        <Btn label="Code block" onClick={() => exec('formatBlock', isBlock('pre') ? 'div' : 'pre')}>
          <UpDownIcon size={14} />
        </Btn>
        <Sep />
        <Btn label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <OrderedListIcon size={15} />
        </Btn>
        <Btn label="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <BulletListIcon size={15} />
        </Btn>
        <Btn label="Indent" onClick={() => exec('indent')}>
          <IndentIcon size={15} />
        </Btn>
        <Btn label="Outdent" onClick={() => exec('outdent')}>
          <OutdentIcon size={15} />
        </Btn>
        <Btn label="Quote" onClick={() => exec('formatBlock', isBlock('blockquote') ? 'div' : 'blockquote')}>
          <QuoteIcon size={14} />
        </Btn>
        <Btn label="Align left" onClick={() => exec('justifyLeft')}>
          <AlignLeftIcon size={15} />
        </Btn>
        <Sep />
        <Btn label="Strikethrough" onClick={() => exec('strikeThrough')}>
          <StrikeIcon size={15} />
        </Btn>
      </div>
      <div
        ref={area}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder="Type Your Reply..."
        onInput={onChange}
        className="editor min-h-[280px] px-2 py-1 text-sm leading-relaxed text-gray-800 focus:outline-none"
      />
    </div>
  );
});
