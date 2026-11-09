import type { DashboardBridge } from '../../shared/app/bridge';
import type { Say } from './chat-screen-commands';
import { droppedFiles, fileMention, mentionInsertion } from '../../shared/chat/chat-commands';
import { IMAGE_LIMIT_SHOWN, imageDataUrl, imagesFit, isImageType, type ChatImage } from '../../shared/chat/chat-transcript';
import { iconOnlyButton } from '../app/icons';
import { imageOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';
import { attachmentKey } from './chat-attachment-keys';

// The images waiting to go with the next prompt, drawn as thumbnails over the box, and the paste and
// drop that bring them: images pasted into the box or dropped anywhere on the screen are attached to
// the next prompt. The window cancels every drop's default, so a file dropped here never replaces the
// page.
//
// Each thumbnail has an x that takes it off. From the keyboard, the attachments key puts the selection
// on the last thumbnail; chat-attachment-keys.ts says what the keys do there, Enter shows the selected
// one full size, and Escape (the screen's interrupt key, chat-view.ts) goes back to the screen: `back`, which
// prefers a waiting permission ask over the prompt.

const HOW_TO_REMOVE = 'The x, or the attachments key then Delete, takes it off; Backspace in an empty prompt takes off the last';

export type Attachments = {
  element: HTMLElement;
  list(): ChatImage[];
  add(more: ChatImage[]): void;
  dropLast(): void;
  clear(): void;
  // Puts the selection on the last thumbnail; false when none is attached.
  select(): boolean;
  // Whether a thumbnail holds the selection, so Escape goes back to the prompt rather than interrupting.
  selecting(): boolean;
};

export function createAttachments(
  screen: HTMLElement, prompt: HTMLTextAreaElement, bridge: DashboardBridge, say: Pick<Say, 'onNotice'>,
  back: () => void,
): Attachments {
  const element = document.createElement('div');
  element.className = 'chat-attached';
  let images: ChatImage[] = [];

  function draw(): void {
    element.replaceChildren(...images.map((picture, index) => {
      const thumbnail = document.createElement('span');
      thumbnail.className = 'chat-attached-image';
      thumbnail.tabIndex = -1;
      thumbnail.title = HOW_TO_REMOVE;
      const image = document.createElement('img');
      image.src = imageDataUrl(picture);
      image.alt = `image ${index + 1}`;
      // The click is delegated below.
      const remove = iconOnlyButton('chat-attached-remove', 'reset', `Remove image ${index + 1}`, () => {});
      remove.tabIndex = -1;
      thumbnail.append(image, remove);
      return thumbnail;
    }));
  }

  // null is back to the screen.
  function selectAt(index: number | null): void {
    const thumbnail = index === null ? null : element.children[index];
    if (thumbnail instanceof HTMLElement) thumbnail.focus();
    else back();
  }

  function removeAt(index: number, select: number | null): void {
    images = images.filter((_, at) => at !== index);
    draw();
    selectAt(select);
  }

  // A click on a thumbnail focuses it, which is the selection; the screen's click handler then shows
  // the image full size. One on its x takes it off.
  element.addEventListener('click', (event) => {
    const remove = event.target instanceof Element ? event.target.closest('.chat-attached-remove') : null;
    const index = [...element.children].findIndex((thumbnail) => thumbnail.contains(remove));
    if (remove && index !== -1) removeAt(index, null);
  });

  element.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    const selected = [...element.children].findIndex((thumbnail) => thumbnail === document.activeElement);
    if (selected === -1) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      imageOverlay(imageDataUrl(images[selected]));
      return;
    }
    const answer = attachmentKey(event.key, selected, images.length);
    if (!answer) return;
    event.preventDefault();
    if (answer.remove === null) selectAt(answer.select);
    else removeAt(answer.remove, answer.select);
  });

  function add(more: ChatImage[]): void {
    images = [...images, ...more];
    draw();
  }

  function attach(files: File[]): void {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result).split(',')[1] ?? '';
        if (!imagesFit([...images.map((picture) => picture.data.length), data.length])) {
          say.onNotice(`That image would put this prompt over ${IMAGE_LIMIT_SHOWN} of images; Claude cannot take it.`);
          return;
        }
        add([{ mediaType: file.type, data }]);
      };
      reader.readAsDataURL(file);
    }
  }

  prompt.addEventListener('paste', (event) => {
    const files = [...event.clipboardData?.files ?? []].filter((file) => isImageType(file.type));
    if (files.length === 0) return;
    event.preventDefault();
    attach(files);
  });

  // Only a drag carrying files lights the box; text dragged out of the log is not something it takes.
  screen.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) screen.classList.add('dropping');
  });
  screen.addEventListener('dragleave', (event) => {
    if (!(event.relatedTarget instanceof Node && screen.contains(event.relatedTarget))) screen.classList.remove('dropping');
  });
  screen.addEventListener('drop', (event) => {
    screen.classList.remove('dropping');
    const dropped = [...event.dataTransfer?.files ?? []];
    if (dropped.length === 0) return;
    const { pictures, paths, refused } = droppedFiles(dropped.map((file) => ({ file, type: file.type, path: bridge.getPathForFile(file) })));
    if (pictures.length > 0) attach(pictures.map((each) => each.file));
    if (paths.length > 0) {
      const insertion = mentionInsertion(prompt.value.slice(0, prompt.selectionStart), paths.map(fileMention));
      prompt.setRangeText(insertion, prompt.selectionStart, prompt.selectionEnd, 'end');
      // setRangeText fires no input event; the box's own handler forgets a recalled prompt and refreshes the command list.
      prompt.dispatchEvent(new Event('input'));
    }
    if (refused) say.onNotice('Only PNG, JPEG, GIF, WEBP images or files on disk can be dropped here.');
    prompt.focus();
  });

  return {
    element,
    list: () => images,
    add,
    // Backspace in an empty box takes the last one off.
    dropLast() {
      images = images.slice(0, -1);
      draw();
    },
    clear() {
      images = [];
      draw();
    },
    select() {
      if (images.length === 0) return false;
      selectAt(images.length - 1);
      return true;
    },
    selecting: () => element.contains(document.activeElement),
  };
}
