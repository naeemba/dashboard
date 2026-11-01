import type { DashboardBridge } from '../../shared/app/bridge';
import type { Say } from './chat-screen-commands';
import { droppedFiles, fileMention, mentionInsertion } from '../../shared/chat/chat-commands';
import { imageDataUrl, imagesFit, isImageType, type ChatImage } from '../../shared/chat/chat-transcript';

// The images waiting to go with the next prompt, drawn as thumbnails over the box, and the paste and
// drop that bring them: images pasted into the box or dropped anywhere on the screen are attached to
// the next prompt. The window cancels every drop's default, so a file dropped here never replaces the
// page.

export type Attachments = {
  element: HTMLElement;
  list(): ChatImage[];
  add(more: ChatImage[]): void;
  dropLast(): void;
  clear(): void;
};

export function createAttachments(
  screen: HTMLElement, prompt: HTMLTextAreaElement, bridge: DashboardBridge, say: Pick<Say, 'onNotice'>,
): Attachments {
  const element = document.createElement('div');
  element.className = 'chat-attached';
  let images: ChatImage[] = [];

  function draw(): void {
    element.replaceChildren(...images.map((picture, index) => {
      const thumbnail = document.createElement('img');
      thumbnail.src = imageDataUrl(picture);
      thumbnail.alt = `image ${index + 1}`;
      return thumbnail;
    }));
  }

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
          say.onNotice('That image would put this prompt over 5 MB of images; Claude cannot take it.');
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
  };
}
