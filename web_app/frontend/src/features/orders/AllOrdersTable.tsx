import React from 'react'
import { useState, useMemo, useRef, useEffect } from 'react';
import { Text, Box, Stack, Group, TextInput, Tooltip, Loader, Pagination } from '@mantine/core';
import type { OrderItem } from './types';
import { extractGdriveId } from './gdriveUtils';
import { Modal, Button } from '@mantine/core';
import { useGoogleAuth } from "../context/google_context/useGoogleAuth";
import { DriveUploadButton } from './DriveUploadButton';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

interface OrdersProps {
  items: OrderItem[];
  checked: Record<string, boolean>;
  findUnfulfilledOrders?: boolean | undefined;
  onToggleChecked: (rowKey: string) => void;
  onUpdateItem: (rowIndex: number, patch: Partial<OrderItem>, rowOrderId?: string) => void;
  designsMap: Record<string, any>;
};


type RowData = OrderItem & { originalIndex: number }

interface UrlFieldProps {
  label: string
  value: string
  onChange: (val: string) => void
  showPreview?: boolean
}

const UrlField = ({ label, value, onChange, showPreview = true }: UrlFieldProps) => {
  const fileId = showPreview ? extractGdriveId(value) : null

  return (
    <Group gap={4} align="center">
      <Text size="11px" c="dimmed" w={90} style={{ flexShrink: 0 }}>{label}:</Text>
      <TextInput
        size="xs"
        styles={{ input: { fontSize: '11px', height: 24, minHeight: 24 } }}
        placeholder="Enter label…"
        value={value}
        onChange={e => onChange(e.currentTarget.value)}
        style={{ width: 300, flexShrink: 0 }}
      />
      <DriveUploadButton label={label} onChange={onChange} />
    </Group>
  )
}

/**
 * Renders a Google Drive thumbnail with automatic retry on load failure.
 *
 * Root cause: on the first request in a browser tab, Google's CDN hasn't
 * established a session yet and may return an auth redirect (HTML) instead
 * of the image — causing a broken/question-mark state.
 * By the time a second input tries the same URL, the session is warmed up.
 *
 * Fix: retry up to MAX_RETRIES times after RETRY_DELAY_MS each time.
 * `key={thumbUrl-attempt}` forces a fresh <img> element on every retry,
 * clearing any cached failure state in the browser.
 */
const thumbnailCache = new Map<string, string>(); // This is how we saved and cache images in disk
export const GdriveImage = ({ href, fileId, publicThumbnailUrl, label, ignore, onShowModal, thumbnailOnly }: {
  href: string; fileId: string; publicThumbnailUrl: string; label: string;
  ignore: boolean; onShowModal: () => void; thumbnailOnly?: boolean
}) => {
  const { signedIn, accessToken } = useGoogleAuth()
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    if (signedIn && fileId && accessToken && !thumbnailOnly) {
      setLoading(true);
      setError(false);
      const cached = thumbnailCache.get(fileId);
      if (cached) {
        setLoading(false);
        setError(false);
        setImgUrl(cached);
        return;
      }
      fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
        .then(res => {
          if (!res.ok) throw new Error('Không tải được ảnh')
          return res.blob()
        })
        .then(blob => {
          objectUrl = URL.createObjectURL(blob)
          if (!revoked) {
            thumbnailCache.set(fileId, objectUrl);
            setImgUrl(objectUrl);
            objectUrl = null // cached — do not revoke on unmount
          }
        })
        .catch(() => { if (!revoked) setError(true) })
        .finally(() => { if (!revoked) setLoading(false) })
      return () => {
        revoked = true
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    } else if (ignore) {
      setImgUrl(publicThumbnailUrl);
    } else if (thumbnailOnly && signedIn && accessToken) {
      setLoading(true);
      setError(false);
      let fileidThumbnail = `${fileId}-thumbnail`;
      const cached = thumbnailCache.get(fileidThumbnail);
      if (cached) {
        setLoading(false);
        setError(false);
        setImgUrl(cached);
        return;
      }
      fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
        .then(res => {
          if (!res.ok) throw new Error('Không tải được ảnh')
          return res.json()
        })
        .then(data => {
          if (data.thumbnailLink) {
            thumbnailCache.set(fileidThumbnail, data.thumbnailLink);
            setImgUrl(data.thumbnailLink);
          }
        })
        .catch(() => { if (!revoked) setError(true) })
        .finally(() => { if (!revoked) setLoading(false) })
    } else {
      setImgUrl(null)
    }
  }, [fileId, ignore, signedIn, accessToken, thumbnailOnly]);

  const handlePreviewClick = () => {
    if (!signedIn && !ignore) {
      onShowModal()
    } else if (imgUrl) {
      setPreviewOpen(true)
    }
  }

  return (
    <>
      {loading && <Loader size="sm" />}
      {error && <Box color="red">Không tải được ảnh</Box>}
      {!loading && !error && imgUrl && (
        <Tooltip label="Nhấn để xem lớn" position="top">
          <img
            src={imgUrl}
            alt={label}
            style={{ width: 80, height: 80, borderRadius: 4, objectFit: 'cover', cursor: 'pointer' }}
            onClick={handlePreviewClick}
          />
        </Tooltip>
      )}
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={label}
        centered
        size="65vw"
        styles={{ body: { height: '65vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f0f4f8' } }}
      >
        <Stack gap="md" align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <img
            src={imgUrl || ''}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
          />
          <Button
            component="a"
            href={href}
            target="_blank"
            rel="noreferrer"
            variant="light"
            size="sm"
          >
            Mở trong Google Drive ↗
          </Button>
        </Stack>
      </Modal>
    </>
  )
}

/** Shows up to 2 thumbnails inline. If more than 2, adds a "+N more" button. Clicking any opens the full gallery modal. */
const MainImagePreview = ({ images, alt }: { images: string[]; alt: string }) => {
  const [opened, setOpened] = useState(false)

  if (!images || images.length === 0)
    return <Text size="xs" c="dimmed">No image</Text>

  const IMAGE_PREVIEW = 1;
  const visibleImages = images.slice(0, IMAGE_PREVIEW);
  const remainingCount = images.length - IMAGE_PREVIEW;

  return (
    <>
      <Group gap={4} align="center">
        {visibleImages && visibleImages.map((src, i) => (
          <Tooltip key={i} label="Nhấn để xem tất cả" position="top">
            <img
              src={src}
              alt={`${alt} ${i + 1}`}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
              onClick={() => setOpened(true)}
            />
          </Tooltip>
        ))}
        {remainingCount > 0 && (
          <Button size="xs" variant="light" onClick={() => setOpened(true)}>
            +{remainingCount} more
          </Button>
        )}
      </Group>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={alt}
        centered
        size="65vw"
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        <Group gap="md" justify="center" wrap="wrap">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`${alt} ${i + 1}`}
              style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8, objectFit: 'contain' }}
            />
          ))}
        </Group>
      </Modal>
    </>
  )
}


export const AllOrderTable = ({ items, onUpdateItem, findUnfulfilledOrders }: OrdersProps) => {


  // Frozen sort order — only recomputed when a new CSV is imported (items.length changes).
  // This prevents rows from jumping around while the user edits inputs.
  const frozenOrderRef = useRef<number[]>([]);
  const prevLengthRef = useRef(-1);
  const PAGE_SIZE = 30;

  if (items.length !== prevLengthRef.current) {
    prevLengthRef.current = items.length;
    const indexed = items.map((item, i) => ({ item, i }));
    frozenOrderRef.current = indexed.map(x => x.i);
  }

  const data = useMemo<RowData[]>(
    () => frozenOrderRef.current.map(i => ({ ...items[i], originalIndex: i })),
    [items]
  );
  const orderGroup = useMemo(() => {
    const map = new Map<string, RowData[]>();
    data.forEach(row => {
      if (!map.has(row.orderId)) {
        map.set(row.orderId, []);
      }
      map.get(row.orderId)!.push(row);
    })
    return Array.from(map.entries()).map(([orderId, rows]) => ({ orderId, rows }))
  }, [data]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, //initial page index
    pageSize: PAGE_SIZE, //default page size
  });
  const pageGroup = orderGroup.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      }
      else {
        next.add(orderId);
      }
      return next;
    })
  };
  const [hoverOrderId, setHoverOrderId] = useState<string | null>(null);
  return (
    <div>
      <Box style={{ overflowX: 'auto', minHeight: 'calc(100vh - 300px)' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 250 }} />
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', backgroundColor: 'var(--mantine-color-gray-2)' }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "12px" }}>Order ID</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "12px" }}>Customer</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "12px" }}>Total</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "12px" }}>Date</th>
              <th style={{ width: 20, padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {pageGroup.map(({ orderId, rows }, index) => {
              const first = rows[0];
              const isExpanded = expandedOrders.has(orderId);
              return (
                <React.Fragment key={orderId}>
                  {/* Main rows - Always display */}
                  <tr
                    onClick={() => toggleExpand(orderId)}
                    onMouseEnter={() => setHoverOrderId(orderId)}
                    onMouseLeave={() => setHoverOrderId(null)}
                    style={{ cursor: "pointer", borderBottom: isExpanded ? "none" : "1px solid var(--mantine-color-gray-2)", backgroundColor: hoverOrderId === orderId ? 'var(--mantine-color-blue-2)' : index % 2 === 0 ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-blue-1)' }}
                  >

                    <td style={{ padding: '8px', fontWeight: 600, fontSize: '12px' }}>{orderId}</td>
                    <td style={{ padding: '8px', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.customer}</td>
                    <td style={{ padding: '8px', fontSize: '12px' }}>${Number(first.orderAmount).toFixed(2)}</td>
                    <td style={{ padding: '8px', fontSize: '12px' }}>{first.orderDate}</td>
                    <td style={{ padding: '8px' }}>{isExpanded ? <IconChevronUp size={15} /> : <IconChevronDown size={18} />}</td>
                  </tr>

                  {/* Only render when isExpanded === true */}
                  {isExpanded && (
                    <tr style={{ borderBottom: '2px solid var(--mantine-color-gray-3)', backgroundColor: index % 2 === 0 ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-blue-1)' }}>
                      <td colSpan={5} style={{ padding: '8px 15px 15px' }}>
                        <Stack gap={15}>
                          <UrlField
                            label="Shipping Label Link"
                            value={first.linkLabel}
                            showPreview={false}
                            onChange={(val: any) => { rows.forEach(r => onUpdateItem(r.originalIndex, { linkLabel: val }, findUnfulfilledOrders ? orderId : undefined)) }}
                          />

                          <Group gap="lg" align="flex-start" wrap="wrap" mt={15}>
                            {rows.map(row => (
                              <Box
                                key={row.originalIndex}
                                style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 140px 100px", columnGap: 12, alignItems: "center", }}
                              >
                                <MainImagePreview images={row.mainImageUrl ?? []} alt={row.productName} />
                                <Text size="12px" style={{ overflow: 'hidden', maxWidth: 550 }}>{row.productName}</Text>
                                <Text size="12px">Product: {row.variation}</Text>
                                <Text size="12px" ta="right">Quantity: {row.quantity}</Text>
                              </Box>
                            ))}
                          </Group>
                        </Stack>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </Box >
      <Group justify='right'>
        <Pagination
          total={Math.ceil(orderGroup.length / pagination.pageSize)}
          onChange={page => setPagination({ ...pagination, pageIndex: page - 1 })}
        />
      </Group>
    </div >
  )
}
