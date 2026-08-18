import { useRef, useState, useEffect } from 'react'
import { Stack, Group, Button, Alert, Text } from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import { useOrdersStore } from './useOrdersStore'
import { AllOrderTable } from './AllOrdersTable'
import { useGoogleAuth } from "../context/google_context/useGoogleAuth";
import { useDesignContext } from '../designs/useDesignContext'

type OrdersPageProps = {
  findUnfulfilledOrders?: boolean;
};
/**
 * Orders page component
 * @returns JSX.Element
 */
export const AllOrderPage = (props: OrdersPageProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploadCount, setCsvUploadCount] = useState(0);
  const {
    items, checked, isLoading, error,
    importCsv, updateItem, toggleChecked, selectAll, clearAll, setItems
  } = useOrdersStore({ findUnfulfilledOrders: props.findUnfulfilledOrders });


  const { signedIn, signIn, accessToken } = useGoogleAuth();
  const { designs, isLoading: isLoadingDesigns, refresh, searchText, 
    setSearchTextWithCache, fetchDesigns, designsMap } = useDesignContext();

  useEffect(() => {
    fetchDesigns();
  }, [accessToken]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file){
      importCsv(file);
      if (props.findUnfulfilledOrders) setCsvUploadCount(c => c + 1)  // ← trigger filter
    } 
    e.target.value = ''
  };

  return (
    <Stack gap="md">
      <h2>All Orders</h2>
      {/* Toolbar */}
      <Group justify="space-between">
        <Group>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button
            leftSection={<IconUpload size={16} />}
            loading={isLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload CSV
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Lỗi đọc file CSV">{error}</Alert>
      )}

      {items.length === 0 && !error && (
        <Text c="dimmed" ta="center" mt="xl">
          Upload a TikTok Shop CSV to get started.
        </Text>
      )}

      <AllOrderTable
        items={items}
        checked={checked}
        onToggleChecked={toggleChecked}
        onUpdateItem={updateItem}
        findUnfulfilledOrders={props.findUnfulfilledOrders}
        designsMap={designsMap}
      />
      </Stack>
  )
};
