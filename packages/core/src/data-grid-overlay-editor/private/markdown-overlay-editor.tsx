import * as React from "react";
import MarkdownDiv from "../../markdown-div/markdown-div";
import GrowingEntry from "../../growing-entry/growing-entry";
import { MarkdownOverlayEditorStyle } from "./markdown-overlay-editor-style";
import { EditPencil, Checkmark } from "../../common/utils";
import type { Rectangle, SelectionRange } from "../../data-grid/data-grid-types";

interface Props {
    readonly targetRect: Rectangle;
    readonly markdown: string;
    readonly onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    readonly onChange: (ev: React.ChangeEvent<HTMLTextAreaElement>) => void;
    readonly forceEditMode: boolean;
    readonly onFinish: () => void;
    readonly validatedSelection?: SelectionRange;

    readonly readonly: boolean;

    createNode?: (content: string) => DocumentFragment;
}

export const MarkdownOverlayEditor: React.FunctionComponent<Props> = p => {
    const {
        markdown,
        onChange,
        onKeyDown,
        forceEditMode,
        createNode,
        targetRect,
        readonly,
        onFinish,
        validatedSelection,
    } = p;

    const [editMode, setEditMode] = React.useState<boolean>(markdown === "" || forceEditMode);
    const onEditClick = React.useCallback(() => {
        setEditMode(e => !e);
    }, []);
    const addLeftPad = markdown ? "ml-6" : "";

    if (editMode) {
        return (
            <MarkdownOverlayEditorStyle targetWidth={targetRect.width}>
                <GrowingEntry
                    autoFocus={true}
                    highlight={false}
                    validatedSelection={validatedSelection}
                    onKeyDown={e => {
                        if (e.key !== "Enter") {
                            onKeyDown(e);
                        }
                    }}
                    value={markdown}
                    onChange={onChange}
                />
                <div className={`edit-icon checkmark-hover ${addLeftPad}`} onClick={() => onFinish()}>
                    <Checkmark />
                </div>
            </MarkdownOverlayEditorStyle>
        );
    }
    return (
        <MarkdownOverlayEditorStyle targetWidth={targetRect.width}>
            <MarkdownDiv contents={markdown} createNode={createNode} />
            {!readonly && (
                <>
                    <div className="spacer" />
                    <div className={`edit-icon edit-hover ${addLeftPad}`} onClick={onEditClick}>
                        <EditPencil />
                    </div>
                </>
            )}
            <textarea className="md-edit-textarea gdg-input" autoFocus={true} onKeyDown={onKeyDown} />
        </MarkdownOverlayEditorStyle>
    );
};
